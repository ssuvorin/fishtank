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
    "adgm_breach_notification": ["breach", "72 hour", "notify", "commissioner", "incident"],
    "adgm_registration_and_policy": ["data protection officer", "dpo", "registration", "fee", "policy"],
    "adgm_data_transfers": [
        "transfer", "outside", "adequacy", "scc", "standard contractual", "safeguard",
    ],
    "uae_security_measures": [
        "encrypt", "security", "pseudonym", "integrity", "access control", "protect",
    ],
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
    "adgm_breach_notification": "The policy omits a 72-hour breach-notification commitment to the ADGM Office of Data Protection.",
    "adgm_registration_and_policy": "The site shows no ADGM registration signal, internal DP policy reference, DPO contact, or data-protection fee awareness.",
    "adgm_data_transfers": "The policy omits transfer safeguards for data leaving ADGM (adequacy list, ADGM SCCs, or derogations under DPR s.40-44).",
    "uae_security_measures": "The policy omits technical/organisational security measures (encryption, pseudonymisation, integrity controls) required by PDPL Art. 20.",
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


_CODE_WINDOW_RE = re.compile(
    r"[{}]|=>|\bfunction\s*\w*\s*\(|\b(?:var|let|const)\s+[\w$]+\s*=|"
    r"\b(?:document|window)\.|<\/?script|!important|indexOf\(|getCookie|push\("
)


def _is_code_window(window: str) -> bool:
    """True when the sentence window is minified JS/CSS rather than prose."""
    if _CODE_WINDOW_RE.search(window):
        return True
    punct = sum(window.count(c) for c in ";={}()")
    return punct >= 6


def extract_evidence(
    rule: Rule,
    text: str,
    policy_texts: list[str] | None = None,
) -> str:
    """Return a verbatim ≤300-char quote containing a rule-relevant keyword.

    Search order: policy pages first (privacy/cookies/legal), then the full
    combined text. Code-like windows (minified JS/CSS) are skipped. Silence →
    explicit absence statement (never fabricated).
    """
    corpus: list[str] = [t for t in (policy_texts or []) if t and t.strip()]
    if text and text.strip():
        corpus.append(text)
    if not corpus:
        return _ABSENCE.get(rule.id, f"The scraped text is silent on {rule.category}.")

    keys = _KEYWORDS.get(rule.id, [])
    mined = _keyword_hits(rule)

    for source in corpus:
        lowered = source.lower()
        # collect all keyword hit positions, primary keys first then mined
        positions: list[int] = []
        for k in keys + mined:
            start = 0
            while True:
                i = lowered.find(k.lower(), start)
                if i == -1:
                    break
                positions.append(i)
                start = i + 1
                if len(positions) >= 40:
                    break
            if len(positions) >= 40:
                break
        if not positions:
            continue
        # prefer the earliest non-code window; fall back to earliest overall
        positions = sorted(set(positions))[:40]
        chosen: int | None = None
        for pos in positions:
            s = max(source.rfind(".", 0, pos), source.rfind("\n", 0, pos)) + 1
            end_cands = [
                j for j in (source.find(".", pos), source.find("\n", pos)) if j != -1
            ]
            e = min(end_cands) + 1 if end_cands else min(len(source), pos + _MAX_QUOTE)
            win = source[s:e].strip()
            if not _is_code_window(win):
                chosen = pos
                break
        if chosen is None:
            # all hits are code — still try next corpus source first
            continue
        start = max(source.rfind(".", 0, chosen), source.rfind("\n", 0, chosen)) + 1
        end_cands = [
            j for j in (source.find(".", chosen), source.find("\n", chosen)) if j != -1
        ]
        end = min(end_cands) + 1 if end_cands else min(len(source), chosen + _MAX_QUOTE)
        quote = source[start:end].strip()
        if len(quote) > _MAX_QUOTE:
            quote = quote[:_MAX_QUOTE].rsplit(" ", 1)[0] + "…"
        return quote

    return _ABSENCE.get(rule.id, f"The scraped text is silent on {rule.category}.")
