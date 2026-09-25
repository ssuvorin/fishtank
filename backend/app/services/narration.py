"""Voiced executive briefing via ElevenLabs text-to-speech (with timestamps).

The spoken script is composed here from structured audit figures — the
endpoint never voices caller-supplied free text, so the API key cannot be
used as an open TTS proxy. Categories are checked against law.json.
"""
from __future__ import annotations

import base64
import hashlib
import re
import time
from collections import OrderedDict, deque

import httpx

from ..config import settings
from ..errors import AuditError
from ..models import NarrationRequest, NarrationResponse, NarrationWord, NarrationCue
from ..rules import get_rules

_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps"
_TIMEOUT_S = 30.0
_CACHE_MAX = 32
_RATE_WINDOW_S = 600.0
_RATE_MAX = 12  # syntheses per client IP per window (cache hits are free)

_cache: OrderedDict[str, NarrationResponse] = OrderedDict()
_hits: dict[str, deque[float]] = {}
_HOST_RE = re.compile(r"^[a-z0-9.-]{1,80}$")
_ORDINALS = ("First", "Second", "Third")


class NarrationUnavailableError(AuditError):
    http_status = 503
    code = "narration_unavailable"


class NarrationRateLimitedError(AuditError):
    http_status = 429
    code = "narration_rate_limited"


def enabled() -> bool:
    return bool(settings.ELEVENLABS_API_KEY)


def spoken_money(amount: float, unit: str = "US dollars") -> str:
    """'561 thousand US dollars' / '1.2 million dirhams' — TTS-friendly."""
    if amount >= 1_000_000:
        v = f"{amount / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{v} million {unit}"
    if amount >= 1_000:
        return f"{round(amount / 1_000):,} thousand {unit}"
    return f"{round(amount):,} {unit}"


def _regime(law: str) -> str:
    if "ADGM" in law:
        return "ADGM rules"
    if "DIFC" in law and "PDPL" not in law:
        return "DIFC law"
    if law.startswith(("UAE", "PDPL")) or "PDPL" in law:
        return "the UAE PDPL"
    return "EU rules"


def build_script(req: NarrationRequest) -> tuple[str, list[tuple[int, str]]]:
    """Return (script, [(char_offset, rule_id)]) — offsets mark where each
    priority item starts, so the UI can light up that pillar while it's spoken."""
    host = req.host.lower().strip()
    if not _HOST_RE.match(host):
        raise ValueError("host must be a bare hostname")
    rules = {r.id: r for r in get_rules()}
    unknown = [t.rule_id for t in req.top if t.rule_id not in rules]
    if unknown:
        raise ValueError(f"unknown rule ids: {', '.join(unknown)}")

    parts: list[str] = []
    cues: list[tuple[int, str]] = []

    def say(text: str, rule_id: str | None = None) -> None:
        offset = sum(len(p) + 1 for p in parts)
        if rule_id:
            cues.append((offset, rule_id))
        parts.append(text)

    say(f"ComplyRisk briefing for {host.removeprefix('www.')}.")
    if req.flagged == 0:
        say(f"We scored {req.total} legal rules, and none crossed the flag threshold on this pass.")
    else:
        say(
            f"We scored {req.total} legal rules and flagged {req.flagged}. "
            f"Modeled exposure is {spoken_money(req.exposure_usd)}, "
            f"about {spoken_money(req.exposure_aed, 'dirhams')}."
        )
        top = req.top[: len(_ORDINALS)]
        cats = [rules[t.rule_id].category for t in top]
        for i, item in enumerate(top):
            rule = rules[item.rule_id]
            name = rule.category
            if cats.count(name) > 1:  # ADGM and PDPL share category names
                name = f"{name} under {_regime(rule.law)}"
            lead = "The largest driver is" if i == 0 else f"{_ORDINALS[i]},"
            say(f"{lead} {name}, at {spoken_money(item.exposure_usd)}.", item.rule_id)
    say("This is a modeled screening signal, not legal advice.")
    return " ".join(parts), cues


def _rate_check(client: str) -> None:
    now = time.monotonic()
    q = _hits.setdefault(client, deque())
    while q and now - q[0] > _RATE_WINDOW_S:
        q.popleft()
    if len(q) >= _RATE_MAX:
        raise NarrationRateLimitedError("Too many voice briefings — try again in a few minutes.")
    q.append(now)


def _words(text: str, starts: list[float], ends: list[float]) -> list[NarrationWord]:
    out: list[NarrationWord] = []
    for m in re.finditer(r"\S+", text):
        a, b = m.start(), m.end() - 1
        if a < len(starts) and b < len(ends):
            out.append(NarrationWord(text=m.group(), start=starts[a], end=ends[b]))
    return out


async def narrate(req: NarrationRequest, client: str) -> NarrationResponse:
    if not enabled():
        raise NarrationUnavailableError("Voice briefing is not configured on this server.")
    script, cue_offsets = build_script(req)
    key = hashlib.sha256(
        f"{settings.ELEVENLABS_VOICE_ID}|{settings.ELEVENLABS_MODEL_ID}|{script}".encode()
    ).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    _rate_check(client)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as http:
            resp = await http.post(
                _TTS_URL.format(voice=settings.ELEVENLABS_VOICE_ID),
                params={"output_format": "mp3_44100_128"},
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                json={
                    "text": script,
                    "model_id": settings.ELEVENLABS_MODEL_ID,
                    "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15},
                },
            )
    except httpx.HTTPError as exc:
        raise NarrationUnavailableError("The voice service did not respond.") from exc
    if resp.status_code != 200:
        raise NarrationUnavailableError(f"The voice service returned HTTP {resp.status_code}.")
    data = resp.json()
    audio = data.get("audio_base64") or ""
    align = data.get("alignment") or {}
    starts = align.get("character_start_times_seconds") or []
    ends = align.get("character_end_times_seconds") or []
    if not audio or not base64.b64decode(audio[:64] + "=" * (-len(audio[:64]) % 4)):
        raise NarrationUnavailableError("The voice service returned no audio.")

    result = NarrationResponse(
        script=script,
        audio_base64=audio,
        mime="audio/mpeg",
        words=_words(script, starts, ends),
        cues=[
            NarrationCue(rule_id=rid, start=starts[off] if off < len(starts) else 0.0)
            for off, rid in cue_offsets
        ],
        voice="ElevenLabs",
    )
    _cache[key] = result
    if len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return result
