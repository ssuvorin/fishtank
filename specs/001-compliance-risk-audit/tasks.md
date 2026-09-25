---

description: "Task list for ComplyRisk AI — 001-compliance-risk-audit"
---

# Tasks: AI Compliance & Financial Risk Auditor (ComplyRisk AI)

**Input**: Design documents from `/specs/001-compliance-risk-audit/`

**Prerequisites**: spec.md (required), .specify/memory/constitution.md (gates all work), law.json (10-rule knowledge base, repo root), docs/project-brief.md

**Tests**: NO test tasks — 3-hour sprint scope; verification is live smoke runs per constitution Principle IV (`docker compose up` / `uvicorn` + `vite`).

**Organization**: Tasks are grouped by user story so each ships an independently demoable increment. MVP = Phase 3 (US1): URL in → exposure number out.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (exposure number, P1 MVP), US2 (severity grid dashboard, P2), US3 (Executive Action Plan export, P3)
- Every task names the exact file path it creates or edits

## Path Conventions

- **Backend**: `backend/app/` (FastAPI, py3.12; compose service `api:8000` runs `uvicorn app.main:app`)
- **Frontend**: `frontend/src/` (React + Vite + TS; compose service `web:5173`, `VITE_API_URL=http://localhost:8000`)
- **Knowledge base**: `law.json` at repo root (mounted/read by the backend)
- **Fixtures**: `backend/fixtures/` for `DEMO_MODE=1` pre-scraped markdown (transport fallback only — Jev/VaR still run live per constitution Principle I)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding so `docker compose up` (or bare-metal `uvicorn` + `vite`) boots both services per constitution Principle IV.

- [ ] T001 Create `backend/requirements.txt` with pinned deps: `fastapi`, `uvicorn[standard]`, `httpx`, `scrapling`, `markdownify`, `pydantic-settings` (backend/Dockerfile already does `pip install -r requirements.txt`)
- [ ] T002 [P] Create FastAPI package skeleton: `backend/app/__init__.py`, `backend/app/main.py` (FastAPI app instance, CORSMiddleware reading `CORS_ORIGINS`, `include_router` for audit router, `/health` endpoint), `backend/app/config.py` (pydantic-settings `Settings` class reading `backend/.env`: `OPENROUTER_API_KEY`, `OPENROUTER_JEV_MODEL` default `~typesafe/jev-latest`, `OPENROUTER_VAR_MODEL` default `~openai/gpt-sol-latest`, `DEMO_MODE`, `CORS_ORIGINS`; fail fast with clear message when `OPENROUTER_API_KEY` absent)
- [ ] T003 [P] Scaffold Vite + React + TS frontend in `frontend/`: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx` placeholder reading `import.meta.env.VITE_API_URL`
- [ ] T004 Create `backend/.env` from the committed `backend/.env.example` keys (`OPENROUTER_API_KEY=`, `OPENROUTER_JEV_MODEL`, `OPENROUTER_VAR_MODEL`); confirm `.env` stays gitignored (root `.gitignore` already covers it); wire `Settings` to read `backend/.env` (compose already passes env vars via `env_file` + `environment`)
- [ ] T005 [P] Create `backend/app/models.py` with Pydantic schemas matching spec entities: `AuditRequest {url: HttpUrl, annual_revenue: float = 5_000_000}`, `ScrapedDocument {source_url, method: "static"|"rendered"|"fixture", text, coverage_notes[]}`, `Rule` (mirrors law.json fields: `id, category, jurisdiction, law, articles[], check_description, noul_assertion, penalty_framework, severity, evidence, source_url, remediation`), `ViolationResult {id, category, law, articles[], probability, exposure_usd, exposure_aed, severity, evidence_quote, remediation, basis}`, `ExposureSummary {usd, aed, by_severity}`, `AuditResponse {url, pages_scraped, exposure, violations[], briefing_md, evidence_coverage}`, `ActionPlan {briefing_md, exposure, violations[], remediation_prioritized[]}`

**Checkpoint**: `docker compose up` boots api:8000 (GET `/health` → 200) and web:5173 (serves placeholder page); `uvicorn app.main:app` works bare-metal from `backend/` with `OPENROUTER_API_KEY` set.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure every user story depends on — rule loading, the two OpenRouter clients, the error taxonomy, and the audit route shell.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T006 [P] Implement law.json loader in `backend/app/rules.py`: `load_rules() -> list[Rule]` reads `law.json` (resolve path relative to repo root, overridable via `LAW_JSON_PATH` env), validates against `Rule` schema on import (fail fast on malformed rule), asserts exactly 10 rules each with `id`, `noul_assertion`, `penalty_framework.default_exposure_calc`, `articles[]`, `severity`, `remediation`; expose `get_rules()` returning the parsed list (parse at module load, not per request — but never cache *scores*, per Principle I)
- [ ] T007 [P] Implement OpenRouter client in `backend/app/openrouter.py`: two async httpx functions — `jev_decisions(state: str, questions: dict[str, str]) -> dict[str, float]` POSTs to `https://openrouter.ai/api/alpha/decisions` with `{"model": settings.OPENROUTER_JEV_MODEL, "state": state, "questions": {rule_id: {"type": "noul", "instructions": assertion}}}` and returns `{rule_id: answers[id].noul}`; `chat_synthesis(prompt: str) -> str` POSTs to `https://openrouter.ai/api/v1/chat/completions` with model `settings.OPENROUTER_VAR_MODEL`; both share `Authorization: Bearer {OPENROUTER_API_KEY}` header, per-request timeout (FR-012: Jev ≤ 45s, chat ≤ 30s), and raise typed errors from T008 on non-2xx/timeout — Jev is NOT chat-compatible, never route it to /chat/completions
- [ ] T008 [P] Implement error taxonomy in `backend/app/errors.py`: `AuditError` base → `InvalidURLError` (non-http(s) scheme, malformed), `UnreachableError` (DNS/timeout/connection), `HTTPFetchError` (4xx/5xx), `BlockedError` (anti-bot), `NoContentError` (no extractable text), `ScoringUnavailableError` (Jev call failed), `SynthesisUnavailableError` (chat call failed); each carries a human-readable `message` and maps to an HTTP status in the route layer (FR-011)
- [ ] T009 Implement `/api/v1/audit` route shell in `backend/app/routers/audit.py` + `backend/app/routers/__init__.py`: `POST /api/v1/audit` accepts `AuditRequest`, validates scheme is http/https (reject others with `InvalidURLError` → 422), wraps the pipeline call (wired in Phase 3), converts `AuditError` subclasses to distinct JSON error bodies (`{"error": message, "code": ...}`) with NO partial exposure figure; register router in `backend/app/main.py` under `/api/v1`

**Checkpoint**: Foundation ready — `POST /api/v1/audit {"url": "ftp://x"}` returns a distinct 422 error; user-story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Submit a URL, Get a Financial Exposure Number (Priority: P1) 🎯 MVP

**Goal**: URL + optional revenue in → scrape landing + privacy policy → one batched Jev call over all 10 rules → total exposure in USD and AED out. The entire pitch in one endpoint.

**Independent Test**: `curl -X POST localhost:8000/api/v1/audit -d '{"url": "<live site>"}'` returns `exposure.usd`, `exposure.aed` (× 3.673), and 10 scored `violations[]` — no frontend required.

### Implementation for User Story 1

- [ ] T010 [US1] Implement scraper service in `backend/app/services/scraper.py` (new `backend/app/services/__init__.py`): `scrape_site(url) -> list[ScrapedDocument]` — fetch landing page with scrapling `Fetcher`; discover privacy-policy link via anchor href/text matching (`/privacy`, `privacy-policy`, `data-protection`, `privacy-notice`, same-origin only); fetch privacy page; convert bodies to text with `markdownify`; fall back to `DynamicFetcher` when static text is boilerplate/too short (FR-003); if `DEMO_MODE=1`, load `backend/fixtures/<slug>.md` instead of fetching (transport fallback ONLY — scoring stays live, Principle I); populate `coverage_notes` when privacy page missing (FR-014); bounded by fetch timeout (FR-012); HTTPS only, refuse non-http(s) (constitution Security)
- [ ] T011 [P] [US1] Implement evidence extraction in `backend/app/services/evidence.py`: `extract_evidence(rule: Rule, text: str) -> str` — pull a verbatim quote (≤ 300 chars) from the scraped text matching the rule's evidentiary keywords, or return an absence statement ("the policy omits X") when the document is silent — never fabricate a quote (Principle II)
- [ ] T012 [US1] Implement scoring service in `backend/app/services/scoring.py`: `score_rules(rules, policy_text) -> dict[str, float]` — build ONE batched `questions` map `{rule.id: rule.noul_assertion}` over the concatenated scraped text (`state`), call `jev_decisions` once per audit (constitution Budget: no per-rule calls, no prompt-retries), return calibrated `noul ∈ [0,1]` per rule id; on failure raise `ScoringUnavailableError` — never fabricate probabilities (FR-005)
- [ ] T013 [US1] Implement exposure calculator in `backend/app/services/exposure.py`: `compute_exposure(rule, noul, annual_revenue) -> tuple[float, str]` — `exposure_usd = default_exposure_calc × noul`; where `penalty_framework` is turnover-scaled (e.g. GDPR 4%/2% turnover rules), resolve `default_exposure_calc` against `annual_revenue` (default 5,000,000); AED rules convert `× 3.673` fixed peg into USD-equivalent before summing; return both USD figure and the `basis` label (`statutory`/`estimate`/`mixed`) so Principle V provenance is preserved in `ViolationResult`
- [ ] T014 [US1] Implement audit orchestrator in `backend/app/services/audit.py`: `run_audit(request) -> AuditResponse` — scrape → concat text → `score_rules` → per-rule `compute_exposure` + `extract_evidence` → build `ViolationResult` (flagged if probability ≥ 0.5, else compliant/not-listed per spec US2 scenario 2) → sum `ExposureSummary {usd, aed: usd×3.673, by_severity counts}` → assemble `AuditResponse` with `pages_scraped`, `evidence_coverage`, and placeholder `briefing_md` (filled in Phase 5); annotate reduced evidence coverage per FR-014
- [ ] T015 [US1] Wire the pipeline in `backend/app/routers/audit.py`: route calls `run_audit`; map `ScoringUnavailableError` → 503 retryable error (degraded result, never fabricated scores per spec edge case); map scrape errors → distinct 4xx/502 bodies; guarantee end-to-end < 90s for a normal site (FR-012)
- [ ] T016 [P] [US1] Pre-scrape `DEMO_MODE=1` fixtures into `backend/fixtures/`: one high-risk startup, one major UAE institutional bank (per constitution Demo safety) — markdown files named by URL slug, loaded by `scrape_site` in demo mode

**Checkpoint**: User Story 1 is fully functional and testable independently — a real URL returns a quantified exposure figure in USD + AED with all 10 rules scored live. **This is the MVP; STOP and validate before continuing.**

---

## Phase 4: User Story 2 — Review the Severity Grid of Violations (Priority: P2)

**Goal**: React dashboard surfaces the audit: URL input, animated scan stages, headline exposure callout, severity-ranked violation cards with citations + evidence quotes + remediation.

**Independent Test**: `npm run dev` in `frontend/`, submit a URL in the browser, see the exposure callout and Critical → High → Medium grid where every card shows category, citations, probability, exposure, evidence quote, remediation (spec SC-004).

### Implementation for User Story 2

- [ ] T017 [P] [US2] Implement API client + types in `frontend/src/api.ts`: `runAudit(url, annualRevenue?) -> Promise<AuditResponse>` POSTs to `${VITE_API_URL}/api/v1/audit`; TS interfaces mirror `AuditResponse`/`ViolationResult`/`ExposureSummary`; typed error surface for the route's distinct error bodies
- [ ] T018 [P] [US2] Implement audit form in `frontend/src/components/AuditForm.tsx` (new `frontend/src/components/` dir): URL input + optional annual-revenue field stating the USD 5,000,000 default assumption (FR-001), submit button, inline display of distinct human-readable errors (FR-011)
- [ ] T019 [P] [US2] Implement scan-stage animation in `frontend/src/components/ScanStages.tsx`: staged progress indicator (Fetching landing page → Discovering privacy policy → Scoring 10 legal rules → Computing exposure) driven by elapsed-time heuristics while the single POST is in flight
- [ ] T020 [P] [US2] Implement exposure callout in `frontend/src/components/ExposureCallout.tsx`: headline "Total Legal Exposure: $X / Y AED" (3.673 peg, both currencies, formatted), provenance label distinguishing `statutory` vs `estimate` figures, and assumed-revenue disclosure (Principle V)
- [ ] T021 [US2] Implement severity grid in `frontend/src/components/ViolationGrid.tsx`: cards ordered Critical → High → Medium, each showing the six required fields — category, law + article citations, calibrated probability, exposure USD/AED, verbatim evidence quote (styled as quote, absence-statements labeled "policy omits"), remediation step; low-probability rules render in a compliant/not-flagged section (spec US2 scenario 2)
- [ ] T022 [US2] Compose the dashboard in `frontend/src/App.tsx` + `frontend/src/index.css`: wire AuditForm → api → ScanStages → ExposureCallout + ViolationGrid; legal-disclaimer footer ("screening signal, not legal advice" per constitution); dark professional pitch-ready styling

**Checkpoint**: User Stories 1 AND 2 both work independently — a judge goes from landing page to quantified exposure + defensible findings grid in one interaction (SC-007).

---

## Phase 5: User Story 3 — Export the Executive Action Plan (Priority: P3)

**Goal**: GPT-6 Sol briefing narrative grounded in actual rule results + a downloadable `ActionPlan` JSON ordered by exposure reduction.

**Independent Test**: Complete any audit, click Export, open the file: valid JSON with briefing narrative, total exposure USD+AED, all 10 rule outcomes, prioritized remediation list (spec SC-005).

### Implementation for User Story 3

- [ ] T023 [US3] Implement briefing service in `backend/app/services/briefing.py`: `generate_briefing(rules, violations, exposure) -> str` — one `chat_synthesis` call to `OPENROUTER_VAR_MODEL` with a constrained prompt containing ONLY the audit's rule results, citations, evidence quotes, and exposure figures; model produces exec narrative + remediation ordering and MUST NOT introduce new violations, article numbers, or penalty figures (Principle II); on failure raise `SynthesisUnavailableError` and degrade to template-rendered briefing (still grounded — no fabricated content)
- [ ] T024 [US3] Wire briefing into `backend/app/services/audit.py`: populate real `briefing_md` on `AuditResponse`; build `ActionPlan` (briefing + exposure + violations + `remediation_prioritized` ordered by `exposure_usd` desc); expose `GET /api/v1/audit/{audit_id}/export` — or, if staying stateless per sprint scope, `POST /api/v1/audit/export` accepting the prior `AuditResponse` body and returning the `ActionPlan` JSON as a `FileResponse`/download — no persistence (constitution Constraints: no persistence layer)
- [ ] T025 [US3] Implement Export Action Plan button in `frontend/src/components/ExportButton.tsx` + wire into `frontend/src/App.tsx`: click → fetch/serialize the `ActionPlan` → trigger browser download of `complyrisk-action-plan-<domain>.json`; works fully offline once the audit result exists (constitution Demo safety)

**Checkpoint**: All user stories independently functional — export produces a portable, valid-JSON audit artifact with narrative + prioritized remediation.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Pitch-readiness pass across all stories.

- [ ] T026 [P] Write `README.md` run steps at repo root: `OPENROUTER_API_KEY` setup, `docker compose up`, bare-metal (`uvicorn app.main:app` + `npm run dev`), `DEMO_MODE=1` usage, the two pre-scraped demo targets, and the API contract (`POST /api/v1/audit` request/response shape)
- [ ] T027 [P] Pitch-ready UI pass on `frontend/src/index.css` + `frontend/src/App.tsx`: consistent severity colors, readable currency formatting, disclaimer visible, laptop-screen demo legibility
- [ ] T028 End-to-end verification on laptop: one live audit + one `DEMO_MODE=1` audit (both demo fixtures), export works with zero network, full audit < 90s (SC-001, constitution Governance acceptance review)
- [ ] T029 Verify `.env` hygiene and secrets: `backend/.env` gitignored, key never committed, compose env defaults match constitution Principle IV

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (needs `app/` package + models) — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational — **blocks US2/US3 demo surfaces** (they render/export what US1's pipeline returns)
- **US2 (Phase 4) + US3 (Phase 5)**: After US1's pipeline exists, proceed **in parallel** — frontend files vs `backend/app/services/briefing.py` are disjoint except the shared touchpoints `audit.py` (T024) and `App.tsx` (T025); if sprint-staffed, serialize those two edits or have one owner do both
- **Polish (Phase 6)**: Depends on US1–US3 complete

### User Story Dependencies

- **US1 (P1, MVP)**: No dependency on other stories — the full backend pipeline
- **US2 (P2)**: Needs US1's `AuditResponse` shape; frontend work can start against the contract in parallel with US1 if contract is fixed first (per `models.py` T005)
- **US3 (P3)**: Needs US1's violations + exposure; briefing service file is independent of US2 frontend work

### Within Each User Story

- Schemas/models before services; services before route wiring
- `scraper.py` → `scoring.py` → `exposure.py` → `audit.py` orchestrator order inside US1
- Components before `App.tsx` composition inside US2

### Parallel Opportunities

- T002/T003, T006/T007/T008, T011 (+T016) run in parallel (disjoint files)
- US2 frontend tasks T017–T021 are all `[P]` (separate component files)
- US2 (frontend/) and US3 backend (T023) run in parallel across the stack
- T026/T027 polish tasks are parallel

---

## Parallel Example: User Story 1

```bash
# After T010 lands, evidence extraction and fixtures are disjoint:
Task: "Implement evidence extraction in backend/app/services/evidence.py"
Task: "Pre-scrape DEMO_MODE fixtures into backend/fixtures/"

# US2 + US3 in parallel after US1 pipeline works:
Task: "Implement ViolationGrid in frontend/src/components/ViolationGrid.tsx"
Task: "Implement briefing service in backend/app/services/briefing.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL gate)
2. Phase 3 US1 → **STOP and VALIDATE**: live `curl` audit returns USD+AED exposure with all 10 rules scored
3. Demo-able at this point — the core pitch ("compliance as a CFO number") already works

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate via curl → MVP demo ready
3. US2 → browser check → full dashboard demo
4. US3 → export check → take-away artifact demo
5. Polish → pitch walkthrough: live audit + `DEMO_MODE=1` fallback per constitution Governance

### Sprint Notes (hackathon window ~3h)

- Constitution gates apply: no cached Jev responses in the scoring path (Principle I); every violation carries verbatim evidence + article citation (Principle II); UAE/DIFC lead, GDPR supplementary (Principle III); exposure labeled statutory vs estimate (Principle V)
- Budget: exactly ONE `/api/alpha/decisions` call per audit (all 10 rules batched) + one chat call — no per-rule Jev calls, no prompt-retry tuning
- If a feature threatens a principle, cut the feature — never silently break the principle
