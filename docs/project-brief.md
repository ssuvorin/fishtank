# PROJECT SPECIFICATION: AI COMPLIANCE & FINANCIAL RISK AUDITOR (DEVIN HUB71)

Track: Security & Governance
Format: In-person hackathon sprint — real build window ~3h (2:00-5:00 PM build, 5:00 PM pitches, 7:00 PM winners). Judges: OpenAI + Cognition + NYUAD. Event: Fish Tank by Devin & Hub71, Sep 25, Hub71, Al Maryah Island, Abu Dhabi (ADGM).
Target Platform: Web App (FastAPI + React Vite), demo on local laptop — venue Wi-Fi risk means no live deploy dependency.

## EXECUTIVE SUMMARY & VALUE PROPOSITION

**Name:** ComplyRisk AI / LegalGuard MENA

**Core Premise:**
Enterprises and scaling startups in the UAE face aggressive cross-border data
protection regimes (EU GDPR, UAE Federal Decree-Law No. 45/2021 PDPL, and DIFC
Data Protection Law No. 5 of 2020). Existing compliance tools only flag vague,
text-based issues.

ComplyRisk AI transforms compliance into a CFO/CISO metric:
"Enter a Website URL -> Instant Scrape & Semantic Vector Matching -> Jev Calibrated
Probability Scoring -> Financial Risk Exposure (Value at Risk in USD/AED) + Action Plan."

**Key Edge:**
Dual-compliance targeting both European expansion (GDPR) and regional MENA/UAE
jurisdictions (UAE PDPL & DIFC), quantifying legal exposure into exact currency fines.

## SYSTEM ARCHITECTURE & SPRINT WORKFLOW

LIVE ONLY: every audit executes the real pipeline — Scrapling fetch, Jev scoring, GPT-6 Sol briefing. No fixture/caching paths.

```
[User Input: Website URL + Optional Annual Revenue ($5M default)]
│
▼

FAST INGESTION

Endpoint triggers Scrapling (Fetcher for static pages, DynamicFetcher fallback
for JS-rendered sites).

Fetches landing page, discovers /privacy policy link, extracts text
(markdownify on the policy body).
│
▼

Splits extracted text into semantic paragraph chunks.

Matches policy chunks against pre-indexed legal articles (GDPR, UAE PDPL, DIFC).
│
▼

DETERMINISTIC PROBABILITY ENGINE (Jev via OpenRouter /api/alpha/decisions)

One batched call per audit: model "~typesafe/jev-latest" (resolves to
typesafe/jev-1.13-YYYYMMDD), state = scraped policy text, questions = map of
assertion_id -> {type: "noul", instructions: <boolean question>}.
Each answer returns a calibrated probability 0.0 - 1.0.
NOTE: decisions endpoint only — Jev is not available via /chat/completions.

Examples:

- Does the policy fail to provide a registered UAE Data Protection Officer (DPO)?
- Does cookie handling rely on implied consent or lack a 1-click 'Reject All'?
- Is there an absence of a clear 72-hour breach notification clause?
│
▼

MONETARY VALUE-AT-RISK (VAR) SYNTHESIS (GPT-6 Sol via OpenRouter)

Calculates financial exposure: Penalty Framework Ceiling * Jev Probability Score.

Generates Executive C-Level Briefing and actionable legal remediation patches.
│
▼

REACT DASHBOARD (Frontend)

Top Metric: "Total Legal Exposure: $420,000 / 1,540,000 AED"

Red Flag Severity Grid: High/Medium/Low risk cards with direct source citations.

Export Button: Download Executive Action Plan (JSON / PDF).
```

## CORE AUDIT CRITERIA & PENALTY BENCHMARKS

### Cookies & Dark Patterns (ePrivacy Directive / EDPB Guidelines 05/2020)

- **Check:** Absence of 1-click "Reject All" button; pre-ticked consent boxes.
- **Penalty Benchmark:** Up to €20M or 4% of worldwide turnover.

### Consent Mechanics (GDPR Art. 7 & UAE PDPL Art. 6)

- **Check:** Passive/implied consent, missing opt-in mechanisms.
- **Penalty Benchmark:** Up to 4% global turnover (GDPR) or millions in AED.

### Local DPO Requirements (UAE PDPL Art. 10 & DIFC DPL Art. 16)

- **Check:** Missing locally resident Data Protection Officer contact details.
- **Penalty Benchmark:** 50,000 AED to 500,000 AED administrative fine.

### Cross-Border Data Transfers (UAE PDPL Art. 22 & DIFC Art. 26)

- **Check:** Unregulated transfer to non-adequate jurisdictions without SCCs.
- **Penalty Benchmark:** Up to 5,000,000 AED / $100,000+ per breach.

### Right to Erasure / "To Be Forgotten" (GDPR Art. 17 & UAE PDPL Art. 15)

- **Check:** Lack of a transparent mechanism to request full account & data wipe.
- **Penalty Benchmark:** Up to €20M or 500,000 AED.

### Child Data Protection (UAE PDPL Art. 13 & GDPR Art. 8)

- **Check:** Missing explicit age thresholds and guardian consent workflows.
- **Penalty Benchmark:** Up to 1,000,000 AED and operational license suspensions.

### 72-Hour Data Breach Protocol (GDPR Art. 33 & UAE PDPL Art. 9)

- **Check:** Absence of documented timelines for notifying regulators and users.
- **Penalty Benchmark:** Up to €10M or 2% global turnover.

### Automated Profiling & AI Transparency (GDPR Art. 22 & UAE PDPL Art. 18)

- **Check:** Failure to disclose automated decision-making and human opt-out.
- **Penalty Benchmark:** Up to 500,000 AED.

## BUILD CHECKLIST (build window 2:00-5:00 PM, pitches at 5:00 — pacing is ours to set)

### Backend

- FastAPI `/api/v1/audit`: Scrapling fetch (privacy link discovery, markdownify) — live fetch every audit.
- law.json loaded as rule set; one batched Jev call (`/api/alpha/decisions`, `~typesafe/jev-latest`, `noul` per rule) over scraped text.
- Deterministic VaR: `exposure = default_exposure_calc * noul`; turnover rules scale with revenue input.
- GPT-6 Sol (`~openai/gpt-sol-latest` via OR chat) generates exec briefing + remediation patch list — live call per audit.

### Frontend

- Hero URL input, animated scan stages, big exposure callout (USD + AED at 3.673 peg).
- Severity grid (High/Medium/Low) with evidence quotes + article citations; Export Action Plan (JSON/PDF).

### Demo prep (before 5:00 PM)

- Full pass on laptop; verify export works offline.
- 3-min pitch: hook = "compliance as a CFO number", live demo on-stage; close on UAE-first law coverage + real DIFC/CNIL enforcement stats.
