"""POST /api/v1/audit (T009/T015) — validate, run pipeline, map typed errors."""
from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..errors import AuditError, InvalidURLError
from ..models import AuditRequest, AuditResponse
from ..services.audit import run_audit
from ..services.scraper import validate_url

log = logging.getLogger(__name__)

router = APIRouter()


def _err(status: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail, "code": code})


@router.post("/audit", response_model=AuditResponse)
async def audit(request: AuditRequest):
    try:
        validate_url(request.url)  # reject non-http(s) before any fetch → 422
        return await run_audit(request)
    except InvalidURLError as exc:
        return _err(422, exc.message, exc.code)
    except AuditError as exc:
        log.warning("audit failed [%s]: %s", exc.code, exc.message)
        return _err(exc.http_status, exc.message, exc.code)
    except Exception as exc:  # never leak a traceback as a 500 body
        log.exception("unexpected audit failure")
        return _err(502, "The audit failed unexpectedly. Please retry.", "audit_error")
