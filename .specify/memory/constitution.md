# ComplyRisk AI Constitution

## Core Principles

### I. Live-Calls-Only Scoring Path
Every audit MUST execute the real pipeline end-to-end: Scrapling fetch → privacy-policy discovery → markdownify extraction → one batched Jev call (`/api/alpha/decisions`, `~typesafe/jev-latest`) → VaR computation → GPT-6 Sol synthesis. No cached Jev responses, no fixture-scored rules, no hardcoded probabilities in the production code path. `DEMO_MODE=1` MAY serve pre-scraped markdown fixtures for venue-Wi-Fi failure, but it is a transport fallback ONLY — the Jev/VaR/synthesis stages still run live against fixture text. If a stage cannot run live, the endpoint MUST return an explicit error, never a fabricated result.

### II. Evidence-Grounded Findings
Every reported violation MUST carry: (a) a verbatim quote or specific absence-statement from the scraped policy text, (b) the exact article citation from `law.json` (`articles[]`), and (c) the rule `id` it was scored under. Findings MUST NOT assert a breach the policy text cannot support — where the document is silent, the finding says "the policy omits X", not "the company violates X". Remediation text MUST come from (or paraphrase) the rule's `remediation` field, not be invented by the synthesis model. GPT-6 Sol output MUST be constrained to the rule set and evidence supplied; it MUST NOT introduce new violations, new article numbers, or new penalty figures.

### III. UAE-First Legal Coverage
UAE PDPL (Federal Decree-Law No. 45/2021) and DIFC DPL No. 5/2020 are the primary jurisdictions; GDPR is secondary, framed as EU-expansion exposure. When a rule cites both regimes, the UAE/DIFC analysis leads and the EU angle is supplementary. Rules MUST respect the known caveats in `law.json._meta.critical_caveats` — e.g. UAE PDPL has no published fine schedule (Art. 26 delegates to an unissued Cabinet decision), UAE PDPL Art. 13 is Right-to-Obtain-Information not child protection, and DIFC Schedule 2 caps are per-contravention USD amounts. Any new rule added to `law.json` MUST be verified against a primary legal source and carry a `source_url`.

### IV. Single-Command Runnability
The whole stack MUST come up with `docker compose up` (or `uvicorn` + `vite` for bare-metal dev) with no manual steps beyond supplying `OPENROUTER_API_KEY`. Required env vars and their defaults (`OPENROUTER_JEV_MODEL`, `OPENROUTER_VAR_MODEL`) are fixed in `docker-compose.yml` and documented; the app MUST fail fast with a clear message when the key is absent. The demo path MUST work on a laptop with no deploy dependency — venue Wi-Fi is a known risk, so offline-capable `DEMO_MODE=1` fixtures (pre-scraped) MUST exist for the two demo targets.

### V. Honest Exposure Estimates
Penalty figures MUST be labeled by provenance: `statutory` (DIFC Schedule 2 caps, GDPR Art. 83 ceilings, CNIL enforced amounts) vs `estimate` (all UAE PDPL AED figures, which are analyst estimates pending the unissued Cabinet schedule — `penalty_framework.basis` in `law.json`). The UI MUST NOT present an estimate as a statutory fine; turnover-based rules MUST scale with the user-provided `annual_revenue` (default USD 5M) and state the formula (`exposure = default_exposure_calc × noul`). AED conversion uses the fixed USD×3.673 peg. Where a rule's `basis` is `mixed`, both components MUST be disclosed.

## Constraints

- **Sprint window.** ~3-hour build (2:00-5:00 PM, pitches at 5:00). Scope is fixed: URL input → scrape → Jev scoring → VaR + remediation → severity-grid dashboard + JSON/PDF export. No new jurisdictions, no auth, no persistence layer, no multi-page scraping beyond landing + privacy policy.
- **Budget.** OpenRouter spend is capped at ~$5 total for the event. Batch Jev into ONE `/api/alpha/decisions` call per audit (all rules in a single `questions` map); GPT-6 Sol synthesis is one chat call per audit. No retries-with-different-prompts for tuning; no per-rule Jev calls.
- **Security.** `OPENROUTER_API_KEY` lives only in `.env` / environment — NEVER committed. `.env` MUST be in `.gitignore`. Scraped content is fetched over HTTPS only; no credentials, cookies, or PII are stored. The audit endpoint MUST validate the input URL and refuse non-http(s) schemes.
- **Legal disclaimer.** Output is a screening signal for demo purposes, not legal advice; estimates are clearly labeled. No claim of statutory UAE fine amounts.

## Governance

This constitution supersedes ad-hoc decisions during the sprint. Amendments require: (a) the change documented here, (b) a one-line rationale, and (c) a bump of the version. For the hackathon window, acceptance review is the on-stage demo plus a final walkthrough of one live audit and one `DEMO_MODE=1` audit; any principle violation found in review blocks the demo claim it affects. If a principle conflicts with shipping on time, the conflict MUST be resolved by cutting the feature, not by silently breaking the principle — a compliance tool that fabricates findings or fines fails its own premise.

**Version**: 1.0.0 | **Ratified**: 2026-09-25 | **Last Amended**: 2026-09-25
