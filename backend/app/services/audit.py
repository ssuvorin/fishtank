"""Audit orchestrator (T014/T024): scrape → score → exposure → briefing, ≤90s cap."""
from __future__ import annotations

import asyncio
import re

from ..errors import AuditError, AuditTimeoutError
from ..models import (
    AuditRequest,
    AuditResponse,
    ExposureSummary,
    FLAG_THRESHOLD,
    ViolationResult,
)
from ..rules import get_rules
from .briefing import generate_briefing
from .evidence import extract_evidence
from .exposure import compute_exposure, statutory_label, usd_to_aed
from .scoring import score_rules
from .scraper import scrape_site, validate_url
from ..models import DEFAULT_REVENUE

_BUDGET_S = 90.0

# ADGM DPR 2021 binds entities established in ADGM. Without any ADGM mention on
# the site the regime has no nexus, so its rules must not price exposure.
_ADGM_NEXUS_RE = re.compile(r"\bADGM\b|Abu Dhabi Global Market", re.I)
_NOT_APPLICABLE = (
    "Not applicable — the site shows no ADGM nexus (no mention of ADGM or "
    "Abu Dhabi Global Market), so ADGM DPR 2021 is not scored."
)


def _applies(rule, corpus: str) -> bool:
    if rule.jurisdiction.strip().upper() == "ADGM":
        return bool(_ADGM_NEXUS_RE.search(corpus))
    return True
_SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


async def _pipeline(request: AuditRequest) -> AuditResponse:
    url = validate_url(request.url)
    revenue = (
        float(request.annual_revenue)
        if request.annual_revenue and request.annual_revenue > 0
        else DEFAULT_REVENUE
    )
    assumed = not (request.annual_revenue and request.annual_revenue > 0)

    docs, text, warnings = await scrape_site(url)
    rules = get_rules()
    corpus = "\n".join(d.text for d in docs)
    applicable = {r.id: _applies(r, corpus) for r in rules}

    # raises ScoringUnavailableError
    scores = await score_rules([r for r in rules if applicable[r.id]], text)

    policy_texts = [d.text for d in docs if d.page_kind != "landing"]
    used_quotes: set[str] = set()
    violations: list[ViolationResult] = []
    for rule in rules:
        applies = applicable[rule.id]
        p = scores.get(rule.id, 0.0) if applies else 0.0
        flagged = applies and p >= FLAG_THRESHOLD
        exposure_usd, basis = compute_exposure(rule, p, revenue) if flagged else (0.0, rule.penalty_framework.basis or "estimate")
        quote = (
            extract_evidence(
                rule, docs[0].text, policy_texts=policy_texts, used=used_quotes,
            )
            if applies
            else _NOT_APPLICABLE
        )
        violations.append(
            ViolationResult(
                id=rule.id,
                category=rule.category,
                law=rule.law,
                articles=rule.articles,
                probability=round(p, 4),
                flagged=flagged,
                exposure_usd=exposure_usd,
                exposure_aed=usd_to_aed(exposure_usd),
                severity=rule.severity,
                basis=basis,
                evidence_quote=quote,
                remediation=rule.remediation,
                statutory_label=statutory_label(rule),
                applicable=applies,
            )
        )

    violations.sort(
        key=lambda v: (_SEVERITY_ORDER.get(v.severity, 9), -v.probability)
    )

    total_usd = round(sum(v.exposure_usd for v in violations if v.flagged), 2)
    exposure = ExposureSummary(usd=total_usd, aed=usd_to_aed(total_usd))
    # Limited = no policy page made it into the audit. Failed guesses at
    # /privacy etc. are normal and no longer mark full coverage as limited.
    limited = not any(d.page_kind != "landing" for d in docs)

    briefing_md = await generate_briefing(violations, exposure)

    return AuditResponse(
        url=url,
        pages_scraped=[d.source_url for d in docs],
        revenue_used=revenue,
        revenue_assumed=assumed,
        limited_coverage=limited,
        exposure=exposure,
        violations=violations,
        briefing_md=briefing_md,
    )


async def run_audit(request: AuditRequest) -> AuditResponse:
    try:
        return await asyncio.wait_for(_pipeline(request), timeout=_BUDGET_S)
    except asyncio.TimeoutError:
        raise AuditTimeoutError(
            "The audit timed out — the site or scoring service is too slow. Retry."
        )
    except AuditError:
        raise
