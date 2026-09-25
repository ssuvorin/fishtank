"""Voiced briefing (ElevenLabs): GET /briefing/voice, POST /briefing/speech."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..errors import AuditError
from ..models import NarrationRequest, NarrationResponse
from ..services import narration

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/briefing/voice")
def voice_status():
    return {"enabled": narration.enabled()}


@router.post("/briefing/speech", response_model=NarrationResponse)
async def speech(body: NarrationRequest, request: Request):
    client = request.client.host if request.client else "unknown"
    try:
        return await narration.narrate(body, client)
    except ValueError as exc:
        return JSONResponse(status_code=422, content={"detail": str(exc), "code": "invalid_request"})
    except AuditError as exc:
        log.warning("narration failed [%s]: %s", exc.code, exc.message)
        return JSONResponse(status_code=exc.http_status, content={"detail": exc.message, "code": exc.code})
