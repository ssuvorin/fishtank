# Implementation Plan: AI Compliance & Financial Risk Auditor (ComplyRisk AI)

**Branch**: `001-compliance-risk-audit` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-compliance-risk-audit/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command; its definition describes the execution workflow.

## Summary

ComplyRisk AI turns a company website URL into a quantified legal-exposure figure. The primary requirement (spec US1–US3): accept a URL plus optional annual revenue (default USD 5,000,000), scrape the landing page and its discovered privacy-policy page, evaluate 10 UAE-first data-protection rules (UAE PDPL + DIFC DPL primary, GDPR as EU-expansion exposure) from `law.json`, score each rule with a calibrated violation probability, and return total exposure in USD and AED (fixed 3.673 peg) — rendered as a severity-ranked findings grid with evidence quotes and exportable as a JSON Executive Action Plan.

Technical approach: a FastAPI backend orchestrates one request-scoped pipeline — Scrapling `Fetcher` fetch with `DynamicFetcher` fallback → privacy-link discovery → `markdownify` text extraction → ONE batched Jev `noul` scoring call via OpenRouter `/api/alpha/decisions` (`~typesafe/jev-latest`) → deterministic VaR computation (`exposure = default_exposure_calc × noul`; turnover formulas resolve against `annual_revenue`) → one GPT-6 Sol chat call (`~openai/gpt-sol-latest`) for the executive briefing and prioritized remediation, constrained to supplied rule results. A React 19 + Vite + TypeScript frontend renders the URL form, animated scan stages, the USD/AED exposure callout, the Critical→High→Medium violation grid, and the export button. No database: all state is request-scoped and in-memory. `DEMO_MODE=1` swaps only the scrape stage for pre-scraped fixtures; Jev, VaR, and synthesis still run live.

## Technical Context

**Language/Version**: Python 3.12 (backend); TypeScript 5.x / React 19 + Vite (frontend)

**Primary Dependencies**: FastAPI, uvicorn, httpx, Scrapling (`Fetcher` + `DynamicFetcher`), markdownify; optional chromadb in in-memory mode (evidence-quote retrieval only — see research.md); frontend: React 19, Vite, TypeScript. Sole external dependency: OpenRouter (Jev decisions endpoint + chat completions).

**Storage**: N/A — no database, no persistence. `law.json` is read at startup; all audit state is request-scoped in-memory and discarded after response (FR-013).

**Testing**: pytest smoke/integration for the scoring pipeline (live or fixture-text); manual/browser verification of the dashboard. No heavyweight test scaffolding in the sprint window.

**Target Platform**: Local laptop demo (macOS/Linux) via `docker compose up` or bare-metal `uvicorn` + `vite`; must run with no deploy dependency (venue Wi-Fi is a known risk).

**Project Type**: web-service (FastAPI backend + React SPA frontend, two compose services: `api` :8000, `web` :5173)

**Performance Goals**: full audit URL-in → exposure-out under 90 seconds end-to-end for a normal site (SC-001, FR-012); one Jev call + one synthesis call per audit (constitution budget: ~$5 total OpenRouter spend).

**Constraints**: per-request timeouts on every external call (fetch, Jev, synthesis); HTTPS-only scraping; no credentials/cookies/PII stored; OpenRouter key via env only, fail fast if absent; exposure math is deterministic Python — the LLM never computes numbers.

**Scale/Scope**: single-site audit per request; exactly 10 rules from `law.json`; two pages fetched (landing + privacy); no auth, no history, no multi-URL comparison.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | How this plan complies |
|-----------|------|------------------------|
| **I. Live-Calls-Only Scoring Path** | Every audit runs the real pipeline; no cached probabilities or fixture-scored rules in the production path. | The `/api/v1/audit` handler always executes scrape → extract → one live batched Jev `/api/alpha/decisions` call → deterministic VaR → one live synthesis call. `DEMO_MODE=1` substitutes pre-scraped markdown ONLY at the fetch stage (transport fallback for venue Wi-Fi); scoring and synthesis still run live on fixture text. A failed stage returns an explicit error — never a fabricated result (FR-011). |
| **II. Evidence-Grounded Findings** | Every violation carries a verbatim quote or absence-statement, exact `articles[]` citation, and the rule `id`; synthesis must not invent violations, articles, or fines. | The `violations[]` contract requires `evidence_quote` (verbatim from scraped text or an explicit "the policy omits X" absence statement), `articles`, and `id` per item. The synthesis prompt receives only the scored rule results and their `remediation`/`evidence` fields and is instructed to paraphrase them, never introduce new findings or penalty figures (see contracts/api-audit.md). |
| **III. UAE-First Legal Coverage** | UAE PDPL and DIFC DPL lead; GDPR is EU-expansion context; `law.json` caveats respected; new rules need a `source_url`. | The rule set is loaded verbatim from `law.json` (10 rules, UAE/DIFC primary). Rule metadata (`jurisdiction`, `articles`, `penalty_framework.basis`, `source_url`) is passed through to the API response and UI unchanged. The `_meta.critical_caveats` are honored: no published PDPL fine schedule is claimed, Art. 13 is treated as Right-to-Obtain-Information, DIFC Schedule 2 caps are per-contravention USD. No new jurisdictions added. |
| **IV. Single-Command Runnability** | `docker compose up` (or `uvicorn` + `vite`) with only `OPENROUTER_API_KEY` required; fail fast on missing key; offline-capable demo path. | `docker-compose.yml` already defines `api` + `web` with env vars (`OPENROUTER_API_KEY`, `OPENROUTER_JEV_MODEL`, `OPENROUTER_VAR_MODEL`) and defaults. The app validates the key at startup and exits with a clear message if absent. Two pre-scraped fixtures (high-risk startup, major UAE institutional bank) under `backend/fixtures/` power `DEMO_MODE=1`. quickstart.md documents both run modes. |
| **V. Honest Exposure Estimates** | Provenance labels (`statutory` vs `estimate` vs `mixed`) preserved; turnover rules scale with `annual_revenue`; formula disclosed; AED at fixed 3.673. | `penalty_framework.basis` is passed through verbatim into each violation item; the UI renders it as a provenance badge and never presents estimates as statutory fines. `default_exposure_calc` is resolved deterministically (fixed amount or turnover formula against `annual_revenue`, default USD 5M); the response discloses `revenue_used` and the formula `exposure = default_exposure_calc × probability`. AED = USD × 3.673. |

**Result**: PASS — no violations. Re-checked after Phase 1 design (data-model.md, contracts/api-audit.md, quickstart.md): no principle is weakened by the design; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-compliance-risk-audit/
├── plan.md              # This file
├── research.md          # Phase 0 output — tool/model/data decisions
├── data-model.md        # Phase 1 output — entities and field schemas
├── quickstart.md        # Phase 1 output — run instructions
├── contracts/           # Phase 1 output
│   └── api-audit.md     # POST /api/v1/audit contract
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by this plan)
```

### Source Code (repository root)

```text
backend/
├── Dockerfile
├── .env                        # OPENROUTER_API_KEY etc. (gitignored)
├── app/
│   ├── main.py                 # FastAPI app, CORS, env validation (fail fast), router mount
│   ├── rules.py                # load law.json; resolve default_exposure_calc (fixed | turnover formula)
│   ├── routers/
│   │   └── audit.py            # POST /api/v1/audit — orchestrates pipeline, error mapping (422/502/503/504)
│   └── services/
│       ├── scraper.py          # Scrapling Fetcher → DynamicFetcher fallback; privacy-link discovery; markdownify
│       ├── scoring.py          # one batched Jev call: POST /api/alpha/decisions, noul questions map
│       ├── var.py              # deterministic exposure math: calc × noul; USD→AED × 3.673; severity ordering
│       └── briefing.py         # one GPT-6 Sol chat call: exec briefing + prioritized remediation, constrained to rule results
└── fixtures/                   # DEMO_MODE=1 pre-scraped markdown (startup + UAE bank)

frontend/
├── Dockerfile
├── package.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx                 # audit form, scan-stage animation, results view
    ├── api.ts                  # typed client for POST /api/v1/audit + error shapes
    └── components/
        ├── UrlForm.tsx         # URL + optional revenue input (USD 5M default disclosed)
        ├── ExposureCallout.tsx # headline USD + AED figure
        ├── ViolationGrid.tsx   # severity-ordered cards: category, citations, probability, exposure, quote, remediation
        └── ExportButton.tsx    # downloads Executive Action Plan JSON

law.json                      # legal knowledge base (10 rules) — read-only input
docker-compose.yml            # api :8000 + web :5173
.env.example                  # OPENROUTER_API_KEY, OPENROUTER_JEV_MODEL, OPENROUTER_VAR_MODEL
```

**Structure Decision**: Option 2 — web application. The repo already carries `backend/` + `frontend/` with Dockerfiles and a `docker-compose.yml` defining `api`/`web`; the plan keeps that layout and adds `app/` (backend) and `src/` (frontend) substructure exactly as listed. `law.json` stays at repo root (mounted/read by the backend; referenced by compose volume `./backend:/app` — rules loader resolves it relative to the app root, falling back to repo root for bare-metal dev).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — section intentionally empty.
