"""Executive briefing synthesis (T023): constrained VaR call, grounded output only."""
from __future__ import annotations

from ..errors import SynthesisUnavailableError
from ..models import ExposureSummary, RemediationItem, ViolationResult
from ..openrouter import chat_synthesis

DISCLAIMER = (
    "*Screening signal for prioritization — not legal advice. AED amounts at the "
    "fixed 3.673 peg; UAE PDPL figures are analyst estimates pending the "
    "unpublished Cabinet fine schedule.*"
)


def _violations_block(violations: list[ViolationResult]) -> str:
    lines = []
    for v in violations:
        status = "FLAGGED" if v.flagged else "compliant"
        lines.append(
            f"- {v.id} [{status}] severity={v.severity} p={v.probability:.2f} "
            f"exposure_usd={v.exposure_usd:.2f} basis={v.basis}\n"
            f"  law: {v.law}; articles: {', '.join(v.articles)}\n"
            f"  evidence: {v.evidence_quote}\n"
            f"  remediation: {v.remediation}"
        )
    return "\n".join(lines)


def _fallback_briefing(violations: list[ViolationResult], exposure: ExposureSummary) -> str:
    """Template-rendered briefing when synthesis is unavailable — still grounded."""
    flagged = [v for v in violations if v.flagged]
    lines = [
        "## Executive Briefing",
        "",
        f"**Total modeled legal exposure: USD {exposure.usd:,.0f} "
        f"(AED {exposure.aed:,.0f})** across {len(flagged)} flagged of "
        f"{len(violations)} audited rules.",
        "",
        "### Priority remediation",
    ]
    for i, v in enumerate(flagged, 1):
        lines.append(
            f"{i}. `{v.id}` — {v.remediation} "
            f"(removes up to USD {v.exposure_usd:,.0f} exposure)"
        )
    if not flagged:
        lines.append("No rules crossed the 0.5 flag threshold.")
    lines += ["", DISCLAIMER]
    return "\n".join(lines)


async def generate_briefing(
    violations: list[ViolationResult], exposure: ExposureSummary
) -> str:
    """One constrained chat call; on failure degrade to template (never fabricate)."""
    prompt = (
        "You are a compliance analyst writing an executive briefing. Use ONLY the "
        "audit data below — you MUST NOT introduce new violations, article numbers, "
        "fine amounts, or remediation steps that are not present here. The model "
        "never computes numbers: quote the supplied figures verbatim.\n\n"
        f"TOTAL EXPOSURE: USD {exposure.usd:.2f} / AED {exposure.aed:.2f}\n\n"
        "RULE RESULTS (id [flagged|compliant] severity probability exposure basis; "
        "law; articles; verbatim evidence quote; remediation):\n"
        f"{_violations_block(violations)}\n\n"
        "Produce Markdown with exactly this structure:\n"
        "## Executive Briefing\n"
        "2-4 sentences summarizing total exposure, how many of the rules are "
        "flagged, and the single largest driver.\n"
        "### Priority remediation\n"
        "A numbered list of the flagged rules ordered by exposure_usd descending: "
        "`<rule_id>` — the supplied remediation text — (removes up to USD "
        "<exposure_usd> exposure). Do not invent actions.\n"
        "Keep it under 300 words. End with the disclaimer line provided below, "
        "verbatim, as the final line:\n"
        f"{DISCLAIMER}"
    )
    try:
        text = await chat_synthesis(prompt)
        if DISCLAIMER not in text:
            text = text.rstrip() + "\n\n" + DISCLAIMER
        return text
    except SynthesisUnavailableError:
        return _fallback_briefing(violations, exposure)


def remediation_plan(violations: list[ViolationResult]) -> list[RemediationItem]:
    flagged = sorted(
        (v for v in violations if v.flagged),
        key=lambda v: v.exposure_usd,
        reverse=True,
    )
    return [
        RemediationItem(
            rule_id=v.id, priority=i, action=v.remediation,
            exposure_reduced_usd=v.exposure_usd,
        )
        for i, v in enumerate(flagged, 1)
    ]
