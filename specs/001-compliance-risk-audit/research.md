# Research: ComplyRisk AI — Technical Decisions

Phase 0 output for `001-compliance-risk-audit`. Each entry: the decision, the alternatives considered, and why the decision wins for this build.

## R1. Scraping: Scrapling (local) vs Jina Reader / hosted readers

**Decision**: Scrapling — `Fetcher` for static pages, `DynamicFetcher` as JS-rendered fallback, `markdownify` for HTML→text. Privacy-policy link discovered from the fetched landing page (anchor scan over hrefs matching `privacy|privacy-policy|data-protection|legal|terms` and footer candidates), then fetched with the same pipeline.

**Alternatives considered**:
- *Jina AI Reader (`r.jina.ai`)*: hosted fetch→markdown. Rejected: adds a second external dependency and API key, another network failure point on venue Wi-Fi, no control over which page gets read,. Cost/latency per audit also grows.
- *Playwright/Selenium only*: heavier than needed; Scrapling's `DynamicFetcher` already covers the JS-rendered fallback case without a second tool in the critical path.
- *httpx + BeautifulSoup manual*: workable but re-implements fetch niceties (TLS fingerprinting, retry, render fallback) Scrapling provides for free.

**Why**: one local library, no key, full control of link discovery, extraction stage is pure text processing on fetched HTML. Satisfies FR-002/FR-003/FR-014.

## R2. Probability scoring: Jev `/api/alpha/decisions` vs chat structured output

**Decision**: one batched call per audit to `POST https://openrouter.ai/api/alpha/decisions` with `model: "~typesafe/jev-latest"`, `state` = scraped policy text, `questions` = `{<rule_id>: {"type": "noul", "instructions": <rule.noul_assertion>}}`. Each answer returns `answers.<rule_id>.noul ∈ [0,1]` — a calibrated probability, used directly as the violation probability.

**Alternatives considered**:
- *Chat model with JSON-schema/structured output* (e.g. GPT-6 Sol returning `{"probability": …}` per rule): rejected. Chat models produce confident-looking but uncalibrated numbers — a generated "0.72" is prose, not a probability; there is no calibration guarantee, and batched JSON output risks dropped/mangled keys under a 10-rule map.
- *Per-rule Jev calls*: rejected by the constitution budget (~$5 total spend); batching all 10 rules into ONE `questions` map is the mandated call pattern.
- *Embeddings similarity score*: not a calibrated violation probability; would need its own thresholding fiction.

**Why**: Jev `noul` returns genuinely calibrated probabilities designed for this exact use; the decisions endpoint natively batches all rules in one request. Jev is NOT available via `/chat/completions` — the decisions endpoint is the only path (verified live; see spec FR-005). Satisfies constitution Principle I (live scoring, no cached probabilities).

## R3. Rule storage: rule assertions injected into the Jev questions map vs ChromaDB retrieval

**Decision**: `law.json` rules are loaded at startup into memory and each rule's `noul_assertion` goes straight into the Jev `questions` map keyed by `rule.id`. ChromaDB is **optional, in-memory only**, for evidence-quote retrieval — embedding scraped paragraph chunks so `evidence_quote` selection can pull the verbatim sentence most relevant to a flagged rule. If chromadb is unavailable, evidence falls back to a keyword-anchored extractive snippet (regex/closest-sentence match against the assertion's key terms) — same contract, simpler path.

**Alternatives considered**:
- *ChromaDB on the rule-scoring path* (retrieve relevant chunks per rule, then score): rejected. It splits the `state` given to Jev, risks starving a rule of context (retrieval miss ≠ absence), and adds a vector-store dependency to the correctness-critical path for zero gain — the full policy text fits in one `state`.
- *LLM-generated evidence quotes*: rejected outright — constitution Principle II requires verbatim quotes or explicit absence statements; a synthesized quote is a fabrication risk.
- *Persistent chroma store*: rejected — FR-013/constitution forbid cross-request state; nothing is stored.

**Why**: the scoring contract needs all 10 rules evaluated against the same document — a direct questions map is simplest and cheapest. Retrieval (when present) only assists locating the *verbatim* quote for display, never changes the probability. Satisfies FR-004, FR-008, Principle II.

## R4. Exposure math: deterministic formula resolution vs LLM-computed numbers

**Decision**: all arithmetic is Python. `rules.py` resolves `default_exposure_calc` per rule: a fixed numeric string, or a turnover formula (`annual_revenue * 0.04`, `max(annual_revenue * 0.04, 500000)`, `annual_revenue * 0.02`) evaluated against the effective revenue (default USD 5,000,000). `var.py` computes `exposure_usd = resolved_calc × noul` (normalizing AED/EUR-denominated calc values to USD per the rule's declared currency handling), and `exposure_aed = exposure_usd × 3.673`. The LLM never computes, transforms, or rounds a number.

**Alternatives considered**:
- *LLM (GPT-6 Sol) computes VaR in the same call that writes the briefing*: rejected. Language models are unreliable at arithmetic; a computed-but-wrong number presented as a CFO metric destroys the product's premise and violates the honest-estimates principle. Briefing receives the computed numbers as input data, read-only.
- *Hardcoding per-rule exposure ceilings as the exposure*: rejected — spec FR-006 mandates `calc × probability`.

**Why**: deterministic math is verifiable, testable, identical live vs demo, and cheap. LLM involvement is confined to (a) calibrated probability (Jev) and (b) narrative synthesis constrained to supplied results. Satisfies FR-006/FR-007, Principle V.

## R5. Narrative synthesis: one constrained call vs per-section generation

**Decision**: one chat call per audit to `~openai/gpt-sol-latest` via `/api/v1/chat/completions`, input = the completed rule results (id, category, articles, probability, exposure, evidence quote, remediation) + totals; output = executive briefing markdown + prioritized remediation list (ordered by exposure reduction). The prompt forbids new violations, new articles, new figures (Principle II).

**Why**: a single call matches the budget constraint, keeps the narrative consistent with the grid (same data in, one voice out), and export (US3) consumes the same `briefing_md` + results — no second render path.
