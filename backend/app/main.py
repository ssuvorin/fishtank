"""ComplyRisk AI backend — FastAPI app entrypoint (T002/T009)."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import audit

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

if not settings.OPENROUTER_API_KEY:
    # Fail fast with a clear message at boot (T002), not mid-request.
    raise RuntimeError(
        "OPENROUTER_API_KEY is not set — copy backend/.env.example to backend/.env "
        "and provide a real key before starting the API."
    )

app = FastAPI(title="ComplyRisk AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audit.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Production static hosting ------------------------------------------------
# Docker prod image copies the Vite build to /app/static; when present the
# dashboard + SPA fallback are served from the same origin (one port total).
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir() and (_STATIC_DIR / "index.html").exists():
    if (_STATIC_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        candidate = _STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC_DIR / "index.html")
