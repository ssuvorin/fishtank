"""Async OpenRouter clients (T007): Jev /api/alpha/decisions + VaR /chat/completions."""
from __future__ import annotations

import asyncio

import httpx

from .config import settings
from .errors import ScoringUnavailableError, SynthesisUnavailableError

_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"
_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
_JEV_TIMEOUT = 45.0
_CHAT_TIMEOUT = 30.0
_MAX_RETRIES = 2  # one retry on 429/5xx


def _headers() -> dict[str, str]:
    if not settings.OPENROUTER_API_KEY:
        raise ScoringUnavailableError(
            "OPENROUTER_API_KEY is not configured — set it in backend/.env"
        )
    return {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }


async def jev_decisions(state: str, questions: dict[str, str]) -> dict[str, float]:
    """One batched call: {rule_id: noul_assertion} → {rule_id: noul ∈ [0,1]}.

    Jev is NOT chat-compatible — never route to /chat/completions.
    """
    body = {
        "model": settings.OPENROUTER_JEV_MODEL,
        "state": state,
        "questions": {
            rid: {"type": "noul", "instructions": assertion}
            for rid, assertion in questions.items()
        },
    }
    try:
        headers = _headers()
    except ScoringUnavailableError:
        raise
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=_JEV_TIMEOUT) as client:
                resp = await client.post(_DECISIONS_URL, json=body, headers=headers)
            if resp.status_code in (429,) or resp.status_code >= 500:
                last_exc = ScoringUnavailableError(
                    f"Jev returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
                if attempt + 1 < _MAX_RETRIES:
                    await asyncio.sleep(1.5)
                    continue
                raise last_exc
            if resp.status_code >= 400:
                raise ScoringUnavailableError(
                    f"Jev rejected the request (HTTP {resp.status_code}): {resp.text[:300]}"
                )
            data = resp.json()
            answers = data.get("answers") or {}
            out: dict[str, float] = {}
            for rid in questions:
                ans = answers.get(rid)
                if not ans or ans.get("noul") is None:
                    raise ScoringUnavailableError(
                        f"Jev answer missing rule {rid!r} — incomplete response"
                    )
                noul = float(ans["noul"])
                out[rid] = min(1.0, max(0.0, noul))
            return out
        except httpx.TimeoutException:
            last_exc = ScoringUnavailableError("Jev decisions call timed out")
            if attempt + 1 < _MAX_RETRIES:
                await asyncio.sleep(1.5)
                continue
            raise last_exc
        except httpx.HTTPError as exc:
            last_exc = ScoringUnavailableError(f"Jev request failed: {exc}")
            if attempt + 1 < _MAX_RETRIES:
                await asyncio.sleep(1.5)
                continue
            raise last_exc
    raise ScoringUnavailableError("Jev decisions call failed") from last_exc


async def chat_synthesis(prompt: str) -> str:
    """Single chat completion for the executive briefing (gpt-sol-latest)."""
    if not settings.OPENROUTER_API_KEY:
        raise SynthesisUnavailableError(
            "OPENROUTER_API_KEY is not configured — set it in backend/.env"
        )
    body = {
        "model": settings.OPENROUTER_VAR_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
    }
    try:
        async with httpx.AsyncClient(timeout=_CHAT_TIMEOUT) as client:
            resp = await client.post(_CHAT_URL, json=body, headers=_headers())
    except httpx.TimeoutException:
        raise SynthesisUnavailableError("Briefing synthesis timed out")
    except httpx.HTTPError as exc:
        raise SynthesisUnavailableError(f"Briefing synthesis failed: {exc}")
    if resp.status_code >= 400:
        raise SynthesisUnavailableError(
            f"Briefing synthesis returned HTTP {resp.status_code}: {resp.text[:200]}"
        )
    try:
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise SynthesisUnavailableError(
            f"Briefing synthesis returned unparseable content: {exc}"
        )
