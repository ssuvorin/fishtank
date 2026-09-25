"""Audit error taxonomy (T008) — typed failures mapped to HTTP codes in the route layer (FR-011)."""
from __future__ import annotations


class AuditError(Exception):
    """Base for all audit-pipeline failures. Carries a machine `code` and http status."""

    http_status: int = 500
    code: str = "audit_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidURLError(AuditError):
    http_status = 422
    code = "invalid_url"


class UnreachableError(AuditError):
    """DNS failure, connection refused/reset, or anti-bot block on the landing page."""

    http_status = 502
    code = "scrape_unreachable"


class HTTPFetchError(AuditError):
    """Landing page returned HTTP 4xx/5xx."""

    http_status = 502
    code = "scrape_http_error"

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class BlockedError(UnreachableError):
    """Anti-bot block (403-ish heuristics)."""


class NoContentError(AuditError):
    """Page fetched but no readable text could be extracted."""

    http_status = 502
    code = "scrape_no_text"


class ScoringUnavailableError(AuditError):
    """Jev decisions call failed or returned unparseable/incomplete answers."""

    http_status = 503
    code = "scoring_unavailable"


class SynthesisUnavailableError(AuditError):
    """Chat synthesis call failed — degradable, route may return briefing_md=""."""

    http_status = 503
    code = "synthesis_unavailable"


class AuditTimeoutError(AuditError):
    """An external stage timed out or the 90s end-to-end budget was hit."""

    http_status = 504
    code = "timeout"
