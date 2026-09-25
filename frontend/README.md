# ComplyRisk frontend

Requires Node 22. Run `npm ci`, then `npm run dev`. The app uses `VITE_API_URL` (or the Vite `/api` proxy to `http://localhost:8000` when unset) and POSTs to `/api/v1/audit`. The backend must permit the frontend origin through CORS. Vite runs on port 5173.

`npm run build` checks TypeScript and creates the production bundle. `npm run test:e2e` runs browser integration tests with request interception, without calling paid services. Tests use installed Google Chrome; alternatively change the Playwright channel and install its Chromium browser. No demo scores are bundled in the app.

Run a real audit after the backend is configured to verify scraping, scoring, CORS and response compatibility. The UI does not claim that browser-only tests verify the live pipeline.
