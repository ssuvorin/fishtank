"""Audit orchestrator (T014/T024): scrape → score → exposure → briefing, ≤90s cap."""
from __future__ import annotations

import asyncio

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

    scores = await score_rules(rules, text)  # raises ScoringUnavailableError

    violations: list[ViolationResult] = []
    for rule in rules:
        p = scores.get(rule.id, 0.0)
        flagged = p >= FLAG_THRESHOLD
        exposure_usd, basis = compute_exposure(rule, p, revenue) if flagged else (0.0, rule.penalty_framework.basis or "estimate")
        quote = extract_evidence(
            rule, text,
            policy_texts=[d.text for d in docs if d.page_kind != "landing"],
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
            )
        )

    violations.sort(
        key=lambda v: (_SEVERITY_ORDER.get(v.severity, 9), -v.probability)
    )

    total_usd = round(sum(v.exposure_usd for v in violations if v.flagged), 2)
    exposure = ExposureSummary(usd=total_usd, aed=usd_to_aed(total_usd))
    limited = len(docs) < 2 or bool(warnings)

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
