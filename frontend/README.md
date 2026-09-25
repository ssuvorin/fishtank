# ComplyRisk frontend

Requires Node 22. Run `npm ci`, then `npm run dev`. The app uses `VITE_API_URL` (or the Vite `/api` proxy to `http://localhost:8000` when unset) and POSTs to `/api/v1/audit`. The backend must permit the frontend origin through CORS. Vite runs on port 5173.

`npm run build` checks TypeScript and creates the production bundle. `npm run test:e2e` runs browser integration tests with request interception, without calling paid services. Tests use installed Google Chrome; alternatively change the Playwright channel and install its Chromium browser. No demo scores are bundled in the app.

Run a real audit after the backend is configured to verify scraping, scoring, CORS and response compatibility. The UI does not claim that browser-only tests verify the live pipeline.

## Visual design

Warm paper, ink typography, an orange action color and a findings ledger. The scan instrument uses the actual [ElevenLabs UI Matrix](https://github.com/elevenlabs/ui/blob/main/apps/www/registry/elevenlabs-ui/ui/matrix.tsx), adapted locally under its MIT license (see `licenses/elevenlabs-ui.md`). Its scan animation runs only while a request is active and stops with reduced-motion preferences. The visual integration needs no ElevenLabs API key and makes no ElevenLabs requests.

The backend from main is integrated into this branch. Browser tests verify frontend behavior using intercepted requests; they do not verify live scoring.
