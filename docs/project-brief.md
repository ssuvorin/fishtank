# PROJECT SPECIFICATION: AI COMPLIANCE & FINANCIAL RISK AUDITOR (DEVIN HUB71)

Track: Security & Governance
Format: 5-Hour MVP Sprint
Target Platform: Web App (FastAPI + React Vite)

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

## SYSTEM ARCHITECTURE & 5-HOUR WORKFLOW

```
[User Input: Website URL + Optional Annual Revenue ($5M default)]
│
▼

FAST INGESTION (0 min dev time)

Endpoint triggers Jina Reader API (https://r.jina.ai/{url}) or Firecrawl.

Extracts clean Markdown representation of landing page & /privacy policy.
│
▼

VECTOR RETRIEVAL (In-Memory ChromaDB)

Splits extracted text into semantic paragraph chunks.

Matches policy chunks against pre-indexed legal articles (GDPR, UAE PDPL, DIFC).
│
▼

DETERMINISTIC PROBABILITY ENGINE (Jev / System One Calibrated Scoring)

Parallel evaluation of Noul boolean assertions (returns 0.0 - 1.0 confidence).

Examples:

- Does the policy fail to provide a registered UAE Data Protection Officer (DPO)?
- Does cookie handling rely on implied consent or lack a 1-click 'Reject All'?
- Is there an absence of a clear 72-hour breach notification clause?
│
▼

MONETARY VALUE-AT-RISK (VAR) SYNTHESIS (GPT Engine)

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

## 5-HOUR SPRINT TIMELINE

### Hour 0:00 - 1:00 | Ingestion & Vector Setup

- Initialize FastAPI backend.
- Ingest Jina Reader / Firecrawl output.
- Load in-memory legal knowledge base with the 8 core articles.

### Hour 1:00 - 2:30 | Probability Engine & Scoring

- Connect Jev API for calibrated probability extraction (Noul queries).
- Pipe calibrated probabilities into GPT prompt for monetary liability calculation.
- Expose single `/api/v1/audit` endpoint.

### Hour 2:30 - 4:00 | React Frontend Development

- Hero search bar with animated scanning stages ("Fetching DOM", "Checking UAE PDPL").
- Large financial risk callout (e.g. "$485,000 Potential Penalty").
- Breakdown cards displaying violations, evidence quotes, and legal articles.

### Hour 4:00 - 5:00 | Testing, Deployment & Demo Prep

- Deploy backend & frontend (Render / Vercel).
- Run test scans against 2 real websites:
  - High-risk target (typical startup with basic cookie banner).
  - Compliant target (major UAE institutional bank).
- Rehearse 3-minute stage pitch for Hub71 Fish Tank judges.
