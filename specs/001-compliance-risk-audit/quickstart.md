# Quickstart: ComplyRisk AI

Prereqs: Docker (compose path) **or** Python 3.12 + Node 20+ (bare-metal path). One secret required either way: an OpenRouter API key.

## 1. Configure environment

```bash
cp .env.example .env
# edit .env — set the key:
#   OPENROUTER_API_KEY=sk-or-...
#   OPENROUTER_JEV_MODEL=~typesafe/jev-latest      (default already set)
#   OPENROUTER_VAR_MODEL=~openai/gpt-sol-latest    (default already set)
```

`.env` is gitignored — never commit it. The API **fails fast at startup** with a clear message if `OPENROUTER_API_KEY` is empty.

For bare-metal dev the backend also reads `backend/.env`; copy the same file there:

```bash
cp .env backend/.env
```

## 2. Run

### Option A — Docker (recommended, one command)

```bash
docker compose up --build
```

- API → http://localhost:8000
- Web → http://localhost:5173 (open this)

### Option B — Bare metal

Terminal 1 (backend):

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn httpx scrapling markdownify
uvicorn app.main:app --reload --port 8000
```

Terminal 2 (frontend):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

### Option C — Offline demo (venue Wi-Fi fallback)

```bash
DEMO_MODE=1 docker compose up --build
# or bare metal:
cd backend && DEMO_MODE=1 uvicorn app.main:app --reload --port 8000
```

`DEMO_MODE=1` serves pre-scraped markdown fixtures (a high-risk startup and a major UAE institutional bank) instead of live Scrapling fetches — the Jev scoring, VaR math, and GPT-6 Sol briefing still run **live** against the fixture text. URLs matching the two fixture targets resolve to their fixtures.

## 3. Smoke test

```bash
curl -s http://localhost:8000/api/v1/audit \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}' | jq '{exposure, flagged: [.violations[] | select(.flagged)] | length, evaluated: (.violations | length)}'
```

Expected shape (numbers vary — scoring is live):

```json
{
  "exposure": { "usd": 1287500.0, "aed": 4728987.5 },
  "flagged": 7,
  "evaluated": 10
}
```

With explicit revenue (turnover-scaled rules recompute against it):

```bash
curl -s http://localhost:8000/api/v1/audit \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "annual_revenue": 50000000}' | jq '.revenue_used'
# → 50000000
```

Error paths to spot-check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/v1/audit \
  -H 'Content-Type: application/json' \
  -d '{"url": "not-a-url"}'
# → 422  (invalid_url)

curl -s http://localhost:8000/api/v1/audit \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://this-domain-does-not-exist-xyz.ae"}' | jq '.code'
# → "scrape_unreachable"  (502)
```

## 4. Frontend walkthrough

1. Paste a URL (revenue field optional — placeholder discloses the USD 5,000,000 default).
2. Click **Audit** — scan stages animate (fetching → discovering policy → scoring → briefing).
3. Read the headline **Total Legal Exposure: $… / … AED**.
4. Inspect the severity grid: Critical → High → Medium cards, each showing category, law/article citations, probability, exposure, evidence quote, remediation, and a `statutory`/`estimate`/`mixed` provenance badge.
5. Click **Export Action Plan** — downloads valid JSON containing the briefing narrative, exposure in both currencies, all 10 rule results, and the prioritized remediation list.

Full audit budget: under 90 seconds end-to-end. Every audit is independent — no caching between submissions.
