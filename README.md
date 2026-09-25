# ComplyRisk AI

**Paste a website URL and get its privacy-law exposure in USD and AED. Devin then opens a pull request that fixes the findings.**

**Live product: http://13.143.65.45:28800/**

Fish Tank by Devin & Hub71 · Abu Dhabi, 25 Sep 2026 · Track: **Security & Governance**

---

## The problem

Companies in the UAE fall under several data-protection regimes at once: UAE PDPL (Federal Decree-Law 45/2021), DIFC DPL 2020, ADGM DPR 2021 and, when they sell into Europe, GDPR. Compliance tools say things like "your consent language may be insufficient", and nobody can prioritize that. A CFO needs a figure. A CTO needs a diff.

## What it does

1. **Audit.** You enter a URL and, optionally, annual revenue. The service crawls the site: landing page, sitemap and the privacy, cookie and terms pages, with a headless-browser fallback for JS sites.
2. **Score.** One batched call to **Jev**, a calibrated probability model on OpenRouter, checks the policy text against **14 rules** from `law.json`. Each rule has exact article citations and a sourced penalty framework.
3. **Price.** The backend calculates exposure deterministically: `penalty ceiling × violation probability`, with turnover-based fines scaled to the revenue you enter. The LLM never produces a number. Each finding is tagged `statutory` or `estimate`.
4. **Explain.** Each finding comes with a **verbatim evidence quote** from the site, or an explicit "the policy omits…" statement, plus the law, articles, severity and remediation. A GPT-written executive briefing sums it up, and an **ElevenLabs voice briefing** has word-level subtitles and highlights the row it is talking about.
5. **Fix.** **"Open PR with Devin"** passes the remediation plan to a Devin cloud session. Devin clones the site's GitHub repo, implements the fixes, opens a PR and reports back. The UI tracks the session live.

## Judging criteria

### Innovation
- **Compliance as a money figure, not a list of warnings.** Calibrated probability × sourced penalty gives exposure in USD/AED (fixed 3.673 peg) per finding and in total.
- **Built for the UAE first.** UAE PDPL, DIFC and ADGM rules, including ADGM-only rules that apply only when the site shows an ADGM nexus. GDPR and ePrivacy cover exposure from EU expansion.
- **The audit ends with a PR, not a PDF.**

### Demo quality
Everything is live, with no fixtures or cached results. Demo flow:
1. Open http://13.143.65.45:28800/ and audit `https://ssuvorin.github.io/fishtank-demo-site/`, a deliberately non-compliant fintech site.
2. Show the exposure headline and the "Where the money is at risk" chart, then play the voice briefing.
3. Open a finding and show the quote, the article citation and whether the fine basis is statutory or estimated.
4. Click **Fix all flagged with AI agent**, then **Open PR with Devin**, and watch the session produce a PR.

Real result of this flow: [fishtank-demo-site PR #2](https://github.com/ssuvorin/fishtank-demo-site/pull/2). It implements 12 findings across `consent.js`, `analytics.js`, `forms.js`, `privacy.html`, `rights.html` and more. It blocks tracking cookies until the visitor consents (checked in headless Chrome) and marks business facts as `TODO` for the owner.

### Hub71 practicality
- The target users are Hub71 and ADGM startups: they can run the audit before a regulator, investor or enterprise customer does.
- It covers the regimes those companies actually face: ADGM, DIFC and onshore UAE.
- It is safe to run against arbitrary URLs. Private, loopback and metadata addresses are rejected before any fetch, raw errors are never shown to users, and the voice endpoint has a per-IP rate limit.
- It was tested on 15 real UAE company sites (careem, bayut, dubizzle, kitopi, uaepass…); the fixes are in PR #3.

### Devin use case
- **Devin is part of the product.** The backend uses the Devin v3 API (`backend/app/services/devin.py`). It creates a session with a structured-output schema (`pr_url`, `summary`, `todo_for_owner`), passes a scoped GitHub token as a sensitive session secret, and caps spend with `max_acu_limit`. The frontend polls the session and links to the live session and the PR.
- **The prompt is grounded in the audit.** Every fact in it comes from the audit response: findings, quotes, articles and acceptance criteria. Devin is told never to invent article numbers and to leave `TODO` placeholders instead of stopping.
- **Devin built this product.** It wrote the core code, and every change reaches `main` through a pull request that Devin opens. It ran the smoke and regression pass on 15 UAE company sites and fixed what it found (PR #3). It merged that PR and deployed it to the production host above.

## Architecture

```
URL ─► scraper (Scrapling: static fetch → headless DOM fallback, sitemap + policy discovery, SSRF guard)
    ─► Jev decisions (1 batched call, 14 rules, calibrated probability each)
    ─► exposure (deterministic: penalty ceiling × p, revenue-scaled, statutory/estimate basis)
    ─► evidence (verbatim quotes, deduplicated across rules)
    ─► briefing (GPT via OpenRouter)  ·  voice (ElevenLabs, word timestamps)
    ─► React dashboard ─► "Open PR with Devin" ─► Devin v3 session ─► GitHub PR
```

| Layer | Stack |
|---|---|
| Backend | FastAPI, Pydantic, httpx, Scrapling (+ Playwright Chromium), markdownify |
| Models | Jev `~typesafe/jev-latest` (OpenRouter decisions API), GPT `~openai/gpt-sol-latest`, ElevenLabs TTS |
| Frontend | React 18 + Vite + TypeScript, anime.js |
| Agent | Devin v3 API |
| Deploy | Single Docker container: Vite build served by FastAPI |

Key files: `law.json` (rules, articles, penalty sources), `backend/app/services/*` (pipeline), `frontend/src/components/*` (UI), `specs/001-compliance-risk-audit/` (spec, API contract).

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/audit` | `{url, annual_revenue?}` → exposure, 14 rule results, briefing |
| `GET` | `/api/v1/briefing/voice` | `{enabled}`: whether voice is configured |
| `POST` | `/api/v1/briefing/speech` | Templated voice briefing: audio + word timings |
| `POST` | `/api/v1/fix-pr` | `{repo, prompt}` → starts a Devin session |
| `GET` | `/api/v1/fix-pr/{session_id}` | Session status, PR URL, owner TODOs |
| `GET` | `/health` | Liveness |

Full contract: `specs/001-compliance-risk-audit/contracts/api-audit.md`.

## Run it

```bash
cp .env.example .env            # set OPENROUTER_API_KEY (required)
                                # optional: ELEVENLABS_API_KEY, DEVIN_API_KEY, DEVIN_ORG_ID, GITHUB_TOKEN
cp .env backend/.env
docker compose up --build       # API :8000, web :5173
```

Production (single container on :28800):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Tests: `cd backend && pip install pytest && python -m pytest` (29 tests). Frontend: `cd frontend && npm run build`.

## Limitations

- This is a screening signal, not legal advice. UAE PDPL fine amounts are analyst estimates until the Cabinet fine schedule is published; every such figure is labeled `estimate`.
- Open legal-model questions: PDPL should not apply to ADGM/DIFC entities, and breach notification is currently counted twice for ADGM sites.
- Hardening backlog: `/docs` is public, there is no global rate limit, and dependency versions are not pinned.

## Team

- Sergey Suvorin: [@ssuvorin](https://github.com/ssuvorin)
- Ivan Doronin: [@doroninivan](https://github.com/doroninivan)
- Devin AI: [@devin-ai-integration](https://github.com/apps/devin-ai-integration), AI software engineer by Cognition
