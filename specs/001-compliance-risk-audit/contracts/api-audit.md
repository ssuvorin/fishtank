# API Contract: POST /api/v1/audit

Single endpoint of the ComplyRisk AI backend. Everything the frontend needs is in this one response — no additional endpoints (export is client-side download of the same payload).

- **Base URL**: `http://localhost:8000` (compose `api` service)
- **Endpoint**: `POST /api/v1/audit`
- **Content-Type**: `application/json`
- **End-to-end budget**: 90 s server-side; every external stage (fetch, Jev, synthesis) has its own per-request timeout (FR-012).
- **No state**: each request is an independent audit — nothing is cached across requests (FR-013).

## Request

```json
{
  "url": "https://example.ae",
  "annual_revenue": 50000000
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `url` | string | yes | Must parse as an `http`/`https` URL with a hostname. Non-http(s) schemes (`file:`, `ftp:`, `javascript:`), empty strings, and unparseable input → **422**. |
| `annual_revenue` | number | no | Annual revenue in USD. Omitted, `null`, non-numeric, or ≤ 0 → defaults to `5000000` and the response sets `revenue_assumed: true` (FR-001). |

## Response 200 — Audit completed

```json
{
  "url": "https://example.ae",
  "pages_scraped": ["https://example.ae", "https://example.ae/privacy-policy"],
  "revenue_used": 50000000,
  "revenue_assumed": false,
  "limited_coverage": false,
  "exposure": {
    "usd": 1287500.0,
    "aed": 4728987.5
  },
  "violations": [
    {
      "id": "cross_border_data_transfers",
      "category": "Cross-Border Data Governance",
      "law": "UAE PDPL Art. 22-23 / DIFC DPL Art. 26-28 / GDPR Art. 44-49",
      "articles": ["UAE PDPL Art. 22", "UAE PDPL Art. 23", "DIFC DPL Art. 26", "DIFC DPL Art. 27", "GDPR Art. 46"],
      "probability": 0.87,
      "flagged": true,
      "exposure_usd": 435000.0,
      "exposure_aed": 1597755.0,
      "severity": "CRITICAL",
      "basis": "mixed: DIFC ~$50k statutory; UAE range is estimate",
      "evidence_quote": "Your information may be transferred to and maintained on servers located outside of your country.",
      "remediation": "Name hosting jurisdictions, identify sub-processors, and cite the specific Art. 23 safeguard (DIFC-issued SCCs exist — 'DIFC Abbreviated SCCs 2023')."
    },
    {
      "id": "uae_data_subject_rights",
      "category": "Data Subject Rights",
      "law": "UAE PDPL Art. 13-18",
      "articles": ["UAE PDPL Art. 13", "UAE PDPL Art. 15", "UAE PDPL Art. 16", "UAE PDPL Art. 17", "UAE PDPL Art. 18", "GDPR Art. 17"],
      "probability": 0.31,
      "flagged": false,
      "exposure_usd": 0.0,
      "exposure_aed": 0.0,
      "severity": "MEDIUM",
      "basis": "estimate",
      "evidence_quote": "You may contact us at privacy@example.ae to exercise your rights.",
      "remediation": "Add a 'Your Rights under UAE PDPL' section: named request channel, committed response timeframe, identity-verification steps."
    }
  ],
  "briefing_md": "## Executive Briefing\n\n**Total modeled legal exposure: USD 1,287,500 (AED 4,728,988)** across 7 flagged of 10 audited rules …\n\n### Priority remediation\n1. `cross_border_data_transfers` — Name hosting jurisdictions … (removes up to USD 435,000 exposure)\n…\n\n*Screening signal for prioritization — not legal advice. AED amounts at the fixed 3.673 peg; UAE PDPL figures are analyst estimates pending the unpublished Cabinet fine schedule.*"
}
```

### Top-level fields

| Field | Type | Notes |
|-------|------|-------|
| `url` | string | The audited URL as submitted. |
| `pages_scraped` | list[string] | Final URLs of pages whose text entered the audit — landing always, plus privacy page when found. On `limited_coverage` this may contain only the landing URL. |
| `revenue_used` | number | Effective annual revenue (USD) applied to turnover-scaled rules. Always disclosed (Principle V). |
| `revenue_assumed` | bool | `true` when the USD 5,000,000 default was applied — UI must display "assumed" label. |
| `limited_coverage` | bool | `true` when the privacy page was not found/blocked or text extraction was partial; audit still completed on available text (FR-014). UI renders a coverage notice; affected `evidence_quote`s use absence statements. |
| `exposure.usd` / `exposure.aed` | number | Total modeled legal exposure — sum of `exposure_usd` over **flagged** violations; `aed = usd × 3.673` (fixed peg, not a live FX rate). |
| `violations` | list | **All 10 rule results** — one per `law.json` rule, none silently omitted (FR-004, SC-002). Ordered `severity` (CRITICAL → HIGH → MEDIUM) then `probability` desc. `flagged: false` items are the compliant rows of the verdict list. |
| `briefing_md` | string | Executive briefing + prioritized remediation list in Markdown (the Action Plan narrative). Grounded in the actual results; contains no violations, articles, or figures not present in `violations`/`exposure` (Principle II). Client-side export = this field plus the rest of the payload serialized to JSON. |

### `violations[]` item schema

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | `law.json` rule id — the same key used in the Jev `questions` map. |
| `category` | string | yes | Rule compliance category. |
| `law` | string | yes | Full law name passthrough. |
| `articles` | list[string] | yes | Exact article citations from `law.json` — never generated (Principle II). |
| `probability` | number 0–1 | yes | Calibrated Jev `noul` answer — live, per-request. |
| `flagged` | bool | yes | `probability >= 0.5`. Only flagged items render as violation cards and contribute to `exposure`. |
| `exposure_usd` | number | yes | `resolved_default_exposure_calc × probability` for flagged items; `0` for compliant items. Deterministic backend math — the LLM never computes numbers. |
| `exposure_aed` | number | yes | `exposure_usd × 3.673`. |
| `severity` | `"CRITICAL"\|"HIGH"\|"MEDIUM"` | yes | From the rule; drives ordering. |
| `basis` | string | yes | `penalty_framework.basis` **passthrough verbatim** — `"estimate"`, statutory marker, or `"mixed: …"`. UI renders as provenance badge; estimates are never presented as statutory fines (Principle V). |
| `evidence_quote` | string | yes when `flagged`; otherwise best-effort | **Verbatim substring** of the scraped text, or an explicit absence statement (`"The policy omits a named DPO contact."`) where the document is silent. Never synthesized (FR-008, Principle II). For compliant items, the supporting quote when found, else `""`. |
| `remediation` | string | yes | Concrete remediation step sourced from the rule's `remediation` field (paraphrase allowed, invention prohibited). |

## Error responses

Errors never carry a partial exposure figure (FR-011, SC-006). Shape:

```json
{ "detail": "Could not reach this site: DNS resolution failed for 'exmaple.ae'.", "code": "scrape_unreachable" }
```

| Status | `code` | When | `detail` example |
|--------|--------|------|------------------|
| **422** | `invalid_url` | Malformed URL, non-http(s) scheme, missing hostname. Fires before any fetch. | `"Invalid URL: only http:// and https:// addresses can be audited."` |
| **502** | `scrape_unreachable` | DNS failure, connection refused/reset, or anti-bot block on the landing page. | `"Could not reach this site: connection timed out."` |
| **502** | `scrape_http_error` | Landing page returns HTTP 4xx/5xx. | `"The site returned HTTP 403 — likely bot-blocked."` |
| **502** | `scrape_no_text` | Page fetched (static + rendered fallback both attempted) but no readable text extracted. | `"Could not extract readable content from this site."` |
| **503** | `scoring_unavailable` | Jev decisions call failed or returned unparseable/incomplete answers — degraded result refused, never fabricated probabilities. | `"Probability scoring is temporarily unavailable — please retry."` |
| **504** | `timeout` | Any external stage exceeded its per-request timeout, or the 90 s end-to-end budget was hit. | `"The audit timed out — the site or scoring service is too slow. Retry."` |

Notes:
- Privacy-page failures do **not** error the audit — they set `limited_coverage: true` (FR-014). Only landing-page failures produce 502.
- `503 scoring_unavailable` uses a distinct code from fetch failures so the UI can offer "Retry" vs "check the URL".
- Synthesis (`briefing_md`) failure after successful scoring MAY return `briefing_md: ""` with all numeric results intact — narrative degradation is acceptable; fabricated numbers are not.

## Export (Executive Action Plan)

No server endpoint. The frontend's Export button serializes the 200 payload — `{ url, revenue_used, exposure, violations, briefing_md }` plus `exported_at` — to a `.json` download (FR-010, US3). Guaranteed valid JSON because it is the already-parsed response.
