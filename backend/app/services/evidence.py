"""Evidence extraction (T011): verbatim quote per rule — never fabricated (Principle II)."""
from __future__ import annotations

import re

from ..models import Rule

_MAX_QUOTE = 300

# Rule id → evidentiary keywords to grep the scraped text for. A hit produces a
# verbatim sentence-window quote; silence produces an explicit absence statement.
_KEYWORDS: dict[str, list[str]] = {
    "uae_pdpl_lawful_consent": ["consent", "withdraw", "opt-in", "opt in", "agree"],
    "uae_dpo_appointment": ["data protection officer", "dpo", "privacy officer"],
    "cross_border_data_transfers": [
        "transfer", "outside", "cross-border", "countries", "international", "servers located",
    ],
    "uae_breach_notification": ["breach", "incident", "notify", "notification", "data leak"],
    "uae_data_subject_rights": [
        "your rights", "access", "rectif", "delet", "erase", "object", "exercise your",
    ],
    "uae_sensitive_data_consent": [
        "sensitive", "children", "child", "minor", "health", "biometric", "special categor",
    ],
    "automated_profiling_transparency": [
        "automated", "profil", "personaliz", "algorithm", "machine learning", "decision",
    ],
    "cookie_reject_dark_patterns": [
        "cookie", "reject", "accept all", "consent banner", "tracking", "opt out", "opt-out",
    ],
    "gdpr_explicit_consent": ["consent", "gdpr", "eea", "european", "withdraw"],
    "gdpr_child_data": ["children", "child", "minor", "age", "16", "13", "parental", "guardian"],
}

_ABSENCE: dict[str, str] = {
    "uae_pdpl_lawful_consent": "The policy omits a provable consent mechanism and the right to withdraw consent at any time.",
    "uae_dpo_appointment": "The policy omits a named Data Protection Officer contact.",
    "cross_border_data_transfers": "The policy omits any statement on cross-border data transfers or transfer safeguards.",
    "uae_breach_notification": "The policy omits a personal-data breach notification commitment.",
    "uae_data_subject_rights": "The policy omits an exercisable data-subject rights process (access/erasure/objection channel).",
    "uae_sensitive_data_consent": "The policy omits treatment of sensitive categories or children's data.",
    "automated_profiling_transparency": "The policy omits disclosure of automated processing/profiling decisions.",
    "cookie_reject_dark_patterns": "The scraped text omits a cookie-consent mechanism; no symmetric reject path could be verified.",
    "gdpr_explicit_consent": "The policy omits GDPR-grade explicit consent language for EEA users.",
    "gdpr_child_data": "The policy omits any age statement or parental-consent mechanism for children.",
}

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?\n])\s+")


def _keyword_hits(rule: Rule) -> list[str]:
    keys = list(_KEYWORDS.get(rule.id, []))
    # also seed with domain terms from the check description / evidence note
    for src in (rule.check_description, rule.evidence):
        for word in re.findall(r"[A-Za-z]{5,}", src.lower()):
            if word not in keys:
                keys.append(word)
    return keys


def extract_evidence(rule: Rule, text: str) -> str:
    """Return a verbatim ≤300-char quote containing a rule-relevant keyword,
    or an explicit absence statement when the document is silent."""
    if not text:
        return _ABSENCE.get(rule.id, f"The scraped text is silent on {rule.category}.")

    lowered = text.lower()
    keys = _KEYWORDS.get(rule.id, [])
    # Find the earliest text position where any keyword appears.
    best_pos, best_key = -1, ""
    for k in keys:
        i = lowered.find(k.lower())
        if i != -1 and (best_pos == -1 or i < best_pos):
            best_pos, best_key = i, k

    if best_pos == -1:
        # broaden to terms mined from check_description/evidence
        for k in _keyword_hits(rule):
            i = lowered.find(k.lower())
            if i != -1 and (best_pos == -1 or i < best_pos):
                best_pos, best_key = i, k
        if best_pos == -1:
            return _ABSENCE.get(
                rule.id, f"The scraped text is silent on {rule.category}."
            )

    # expand to enclosing sentence boundaries
    start = max(text.rfind(".", 0, best_pos), text.rfind("\n", 0, best_pos)) + 1
    end_candidates = [
        j for j in (text.find(".", best_pos), text.find("\n", best_pos)) if j != -1
    ]
    end = min(end_candidates) + 1 if end_candidates else min(len(text), best_pos + _MAX_QUOTE)
    quote = text[start:end].strip()
    if len(quote) > _MAX_QUOTE:
        quote = quote[: _MAX_QUOTE].rsplit(" ", 1)[0] + "…"
    return quote
