"""law.json knowledge-base loader (T006) — parse once at import; never cache scores."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .config import settings
from .models import Rule

_EXPECTED_RULES = 14


def _law_json_path() -> Path:
    if settings.LAW_JSON_PATH:
        p = Path(settings.LAW_JSON_PATH)
        if p.exists():
            return p
    here = Path(__file__).resolve()
    candidates = [
        Path("/app/law.json"),          # docker mount (dev + prod image)
        Path.cwd() / "law.json",        # repo root or /app cwd
        Path.cwd().parent / "law.json",
    ]
    candidates += [p / "law.json" for p in here.parents[:4]]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "law.json not found; set LAW_JSON_PATH (tried /app/law.json, repo root, cwd)"
    )


@lru_cache(maxsize=1)
def load_rules() -> list[Rule]:
    """Load and validate law.json once; fail fast on malformed rules."""
    path = _law_json_path()
    raw = json.loads(path.read_text(encoding="utf-8"))
    entries = raw.get("rules", [])
    rules = [Rule.model_validate(e) for e in entries]
    assert len(rules) == _EXPECTED_RULES, (
        f"law.json must contain exactly {_EXPECTED_RULES} rules, found {len(rules)}"
    )
    for r in rules:
        for field in ("id", "noul_assertion", "articles", "severity", "remediation"):
            assert getattr(r, field, None), f"rule {r.id!r} missing {field}"
        assert r.penalty_framework.modeled_calc, (
            f"rule {r.id!r} missing penalty_framework.modeled_calc"
        )
    return rules


def get_rules() -> list[Rule]:
    return load_rules()
