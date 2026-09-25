"""POST /api/v1/fix-pr + GET /api/v1/fix-pr/{session_id} — Devin PR hand-off."""
from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..errors import AuditError
from ..services.devin import create_fix_session, get_fix_session

log = logging.getLogger(__name__)

router = APIRouter()


class FixPRRequest(BaseModel):
    repo: str = Field(min_length=3, max_length=200)
    prompt: str = Field(min_length=20, max_length=60_000)


def _err(exc: AuditError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status, content={"detail": exc.message, "code": exc.code}
    )


@router.post("/fix-pr")
async def create_fix_pr(request: FixPRRequest):
    try:
        return await create_fix_session(request.repo, request.prompt)
    except AuditError as exc:
        log.warning("fix-pr create failed [%s]: %s", exc.code, exc.message)
        return _err(exc)


@router.get("/fix-pr/{session_id}")
async def fix_pr_status(session_id: str):
    try:
        return await get_fix_session(session_id)
    except AuditError as exc:
        log.warning("fix-pr status failed [%s]: %s", exc.code, exc.message)
        return _err(exc)
