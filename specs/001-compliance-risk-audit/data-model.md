# Data Model: ComplyRisk AI

Phase 1 output. All entities are request-scoped and in-memory — no persistence (constitution: no DB; FR-013: each submission is a fresh independent audit). `Rule` is loaded once at startup from `law.json` and treated as immutable reference data.

## AuditRequest

A single audit submission. Created by the router, carried through the pipeline.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `url` | string (http/https URL) | yes | Validated at ingest; non-http(s) schemes rejected → 422. Trailing fragments stripped for fetch. |
| `annual_revenue` | float (USD) | no | Omitted/invalid → `DEFAULT_REVENUE = 5_000_000` and `revenue_assumed = true`. |
| `revenue_assumed` | bool | derived | True when the default was applied; surfaced in the response so the UI discloses the assumption (FR-001). |
| `request_id` | string (uuid4) | internal | Correlates stage errors/logs; no persistence. |
| `submitted_at` | datetime (UTC) | internal | Audit start timestamp; drives the 90s end-to-end budget. |

## ScrapedDocument

Text extracted from one fetched page. An audit holds a `landing` document and optionally a `privacy` document.

| Field | Type | Notes |
|-------|------|-------|
| `source_url` | string | Final URL after redirects. |
| `page_kind` | `"landing"` \| `"privacy"` | Role in the audit. |
| `extraction_method` | `"static"` \| `"rendered"` \| `"fixture"` | `static` = Scrapling Fetcher; `rendered` = DynamicFetcher fallback (FR-003); `fixture` = DEMO_MODE pre-scraped markdown. |
| `text` | string | Readable markdown text (markdownify output or fixture body). Empty → error path, never scored. |
| `coverage_notes` | list[string] | E.g. `"privacy page not found — landing text only"`, `"rendered fetch used"`, `"non-English text detected — reduced confidence"`. Surfaced as `pages_scraped` context + limited-coverage flag (FR-014). |

## Rule

One legal rule from `law.json` (10 loaded at startup; every rule is always evaluated — FR-004).

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable rule id, e.g. `uae_pdpl_lawful_consent`. Keys the Jev `questions` map and the response item. |
| `category` | string | e.g. `"Data Subject Consent"`, `"Cross-Border Data Governance"`. |
| `jurisdiction` | string | e.g. `"UAE Mainland"`, `"UAE / DIFC / EU"`, `"EU (expansion risk)"`. UAE/DIFC lead (Principle III). |
| `law` | string | Full law name, e.g. `"UAE Federal Decree-Law No. 45/2021 on Personal Data Protection (PDPL)"`. |
| `articles` | list[string] | Exact citations passed through to output, e.g. `["UAE PDPL Art. 22", "DIFC DPL Art. 26"]`. |
| `check_description` | string | Human-readable audit check. |
| `noul_assertion` | string | The boolean violation assertion — verbatim `instructions` for the Jev `noul` question. |
| `penalty_framework` | object | See below. |
| `severity` | `"CRITICAL"` \| `"HIGH"` \| `"MEDIUM"` | Drives grid ordering (Critical → High → Medium). |
| `evidence` | string | Canonical analyst/legal note (constitution Principle II source material). |
| `source_url` | string | Primary legal source — required per Principle III. |
| `remediation` | string | Canonical remediation text; synthesis may paraphrase but not replace it. |

### Rule.penalty_framework

| Field | Type | Notes |
|-------|------|-------|
| `type` | `"administrative_fine"` \| `"turnover_or_fixed"` | Determines how `default_exposure_calc` resolves. |
| `currency` | `"AED"` \| `"USD"` \| `"EUR"` | Denomination of the framework figures. |
| `default_exposure_calc` | string | Either a fixed amount (`"750000"`) or a turnover formula (`"annual_revenue * 0.04"`, `"max(annual_revenue * 0.04, 500000)"`) — resolved deterministically in `rules.py` against effective revenue. |
| `basis` | string | Provenance label: `"estimate"` (UAE PDPL — no published fine schedule), statutory markers for DIFC Schedule 2 / GDPR / CNIL, or `"mixed: …"` strings carried verbatim into the API response (Principle V). |
| `min_fine` / `max_fine` | number | Fixed-range frameworks (optional per rule). |
| `difc_schedule2_max` | number | DIFC per-contravention USD cap (optional). |
| `uae_min_fine` / `uae_max_fine` / `uae_currency` | number/string | UAE AED range when a USD-denominated framework also cites UAE exposure (optional). |
| `gdpr_max_fixed_fine` / `gdpr_max_turnover_pct` / `max_fixed_fine` / `max_turnover_pct` | number | Turnover-framework ceilings (optional). |
| `note` / `uae_note` | string | Analyst caveat text (optional; passthrough). |

## ViolationResult

Outcome of evaluating one Rule against the scraped text — one per rule, always (rules scoring below the flag threshold are reported as compliant, not omitted — FR-004, US2 scenario 2).

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Rule id. |
| `category` | string | Passthrough from Rule. |
| `law` | string | Passthrough from Rule. |
| `articles` | list[string] | Passthrough from Rule — exact citations (Principle II). |
| `probability` | float 0.0–1.0 | Jev `noul` answer — live per audit, never cached/hardcoded (Principle I). |
| `flagged` | bool | `probability >= FLAG_THRESHOLD` (0.5). False → shown as compliant, excluded from violation count/exposure contribution per product decision: unflagged rules contribute `0` to totals (exposure shown only for flagged items) — see contracts note. |
| `exposure_usd` | float | `resolved_default_exposure_calc × probability` when flagged; `0` when compliant. Deterministic (research R4). |
| `exposure_aed` | float | `exposure_usd × 3.673`. |
| `severity` | string | Passthrough from Rule. |
| `evidence_quote` | string | **Required when flagged**: verbatim substring of scraped text supporting the finding, or an explicit absence statement (`"The policy omits …"`) when the document is silent — never synthesized (Principle II, FR-008). |
| `remediation` | string | From Rule.remediation (or a paraphrase supplied by synthesis, grounded in it). |
| `basis` | string | Passthrough of `penalty_framework.basis` — provenance label rendered as a badge (Principle V). |

## ExposureSummary

Aggregate result of one audit.

| Field | Type | Notes |
|-------|------|-------|
| `total_usd` | float | Sum of flagged `exposure_usd`. |
| `total_aed` | float | `total_usd × 3.673`. |
| `rules_evaluated` | int | Always 10 on success (SC-002). |
| `rules_flagged` | int | Count where `flagged == true`. |
| `counts_by_severity` | object | `{"CRITICAL": n, "HIGH": n, "MEDIUM": n}` over flagged results. |
| `revenue_used` | float | Effective annual revenue applied to turnover rules (discloses the USD 5M default — FR-001). |
| `violations` | list[ViolationResult] | All 10 results, ordered severity → probability desc. |
| `limited_coverage` | bool | True when privacy page unobtainable or text partial (FR-014). |

## ActionPlan

The exportable artifact (US3) — also the payload backing `briefing_md`.

| Field | Type | Notes |
|-------|------|-------|
| `briefing_md` | string | Executive C-level briefing narrative in Markdown — synthesized by GPT-6 Sol, constrained to the supplied rule results (FR-009, Principle II). |
| `exposure` | ExposureSummary | The aggregate block (embedded in the response as `exposure` + `violations`). |
| `remediation_plan` | list[RemediationItem] | Ordered by `exposure_usd` reduction desc. |

### ActionPlan.RemediationItem

| Field | Type | Notes |
|-------|------|-------|
| `rule_id` | string | Links to ViolationResult.id. |
| `priority` | int | 1-based rank by exposure reduction. |
| `action` | string | Concrete remediation step (from Rule.remediation). |
| `exposure_reduced_usd` | float | The rule's `exposure_usd` this action addresses. |

## Relationships

```text
AuditRequest 1─1 ExposureSummary
AuditRequest 1─n ScrapedDocument        (landing + optional privacy)
Rule        1─1 ViolationResult        (10 rules → 10 results, no skips)
ExposureSummary 1─n ViolationResult
ExposureSummary 1─1 ActionPlan         (briefing_md + remediation_plan)
```
