"""Pydantic schemas mirroring spec entities (T005) and contracts/api-audit.md."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

DEFAULT_REVENUE = 5_000_000.0
FLAG_THRESHOLD = 0.5
AED_PEG = 3.673  # fixed USD→AED peg


class AuditRequest(BaseModel):
    url: str
    annual_revenue: float | None = None

    @field_validator("url")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("url is required")
        return v


class ScrapedDocument(BaseModel):
    source_url: str
    page_kind: Literal["landing", "privacy"]
    extraction_method: Literal["static", "rendered"]
    text: str
    coverage_notes: list[str] = Field(default_factory=list)


class PenaltyFramework(BaseModel):
    model_config = {"extra": "allow"}

    type: str = "administrative_fine"
    currency: str = "USD"
    default_exposure_calc: str = "0"
    basis: str = "estimate"


class Rule(BaseModel):
    model_config = {"extra": "allow"}

    id: str
    category: str
    jurisdiction: str = ""
    law: str
    articles: list[str] = Field(default_factory=list)
    check_description: str = ""
    noul_assertion: str
    penalty_framework: PenaltyFramework
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    evidence: str = ""
    source_url: str = ""
    remediation: str = ""


class ViolationResult(BaseModel):
    id: str
    category: str
    law: str
    articles: list[str]
    probability: float
    flagged: bool
    exposure_usd: float
    exposure_aed: float
    severity: str
    basis: str
    evidence_quote: str
    remediation: str


class ExposureSummary(BaseModel):
    usd: float
    aed: float


class AuditResponse(BaseModel):
    url: str
    pages_scraped: list[str]
    revenue_used: float
    revenue_assumed: bool
    limited_coverage: bool
    exposure: ExposureSummary
    violations: list[ViolationResult]
    briefing_md: str


class RemediationItem(BaseModel):
    rule_id: str
    priority: int
    action: str
    exposure_reduced_usd: float


class ActionPlan(BaseModel):
    url: str
    exported_at: str
    briefing_md: str
    exposure: ExposureSummary
    violations: list[ViolationResult]
    remediation_plan: list[RemediationItem]


class AuditContext(BaseModel):
    """Internal request-scoped carrier (data-model.md AuditRequest internals)."""

    request_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    url: str = ""
    annual_revenue: float = DEFAULT_REVENUE
    revenue_assumed: bool = True
