"""Jev scoring (T012): ONE batched decisions call per audit — never per-rule."""
from __future__ import annotations

from ..errors import ScoringUnavailableError
from ..models import Rule
from ..openrouter import jev_decisions

# Keep the state under a sane size — policies beyond this are truncated.
_MAX_STATE_CHARS = 60_000


async def score_rules(rules: list[Rule], policy_text: str) -> dict[str, float]:
    """Map every rule id → calibrated noul probability via one Jev call."""
    if not policy_text.strip():
        raise ScoringUnavailableError("No text was scraped — nothing to score.")
    state = policy_text[:_MAX_STATE_CHARS]
    questions = {r.id: r.noul_assertion for r in rules}
    scores = await jev_decisions(state, questions)
    missing = [r.id for r in rules if r.id not in scores]
    if missing:
        raise ScoringUnavailableError(
            f"Jev response missing scores for: {', '.join(missing)}"
        )
    return scores
