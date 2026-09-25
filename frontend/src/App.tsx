import { useState } from 'react'
import { AuditApiError, runAudit } from './api'
import type { AuditResponse } from './api'
import AuditForm from './components/AuditForm'
import ScanStages from './components/ScanStages'
import ExposureCallout from './components/ExposureCallout'
import ViolationGrid from './components/ViolationGrid'
import BriefingPanel from './components/BriefingPanel'
import ExportButton from './components/ExportButton'
import ExposureInsights from './components/ExposureInsights'
import { FixReportButton } from './components/FixPrompt'
import RegulatorStrip from './components/RegulatorStrip'
import AmbientBackground from './components/AmbientBackground'
import BriefingVoice from './components/BriefingVoice'
import ExposureChart from './components/ExposureChart'
import { hostOf } from './format'

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: AuditResponse }
  | { kind: 'error'; message: string; code: string; retryable: boolean }

const FRAMEWORKS = ['UAE PDPL', 'DIFC DPL 2020', 'ADGM DPR 2021', 'EU GDPR', 'ePrivacy Directive']

/** Plain-language titles for API error codes — the raw code stays as a small tag. */
const ERROR_TITLE: Record<string, string> = {
  invalid_url: 'That address can’t be audited',
  scrape_unreachable: 'We couldn’t reach the site',
  scrape_http_error: 'The site returned an error',
  scrape_no_text: 'No readable text on the page',
  scoring_unavailable: 'Scoring service unavailable',
  timeout: 'The audit timed out',
  network_error: 'Audit service offline',
}

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden>
      <path
        d="M16 3.5l10.5 4.6v7.6c0 6.4-4.4 11.3-10.5 13.1C9.9 27 5.5 22.1 5.5 15.7V8.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M11 16.8l3.4 3.4 6.8-7.4"
        fill="none"
        stroke="#e3ad52"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [lastRequest, setLastRequest] = useState<{
    url: string
    revenue?: number
  } | null>(null)

  async function submit(url: string, revenue?: number) {
    setLastRequest({ url, revenue })
    setPhase({ kind: 'loading' })
    try {
      const result = await runAudit({ url, annual_revenue: revenue })
      setPhase({ kind: 'done', result })
    } catch (err) {
      if (err instanceof AuditApiError) {
        setPhase({
          kind: 'error',
          message: err.message,
          code: err.code,
          // everything but a bad URL can succeed on a second try (bot walls,
          // cold headless browser, flaky upstream)
          retryable: err.code !== 'invalid_url' && err.status !== 422,
        })
      } else {
        setPhase({
          kind: 'error',
          message: 'Unexpected error — check the console.',
          code: 'client_error',
          retryable: true,
        })
      }
    }
  }

  const status =
    phase.kind === 'loading'
      ? { tone: 'live', text: 'Audit running' }
      : phase.kind === 'done'
        ? { tone: 'ok', text: 'Audit complete' }
        : phase.kind === 'error'
          ? { tone: 'warn', text: 'Needs attention' }
          : { tone: 'idle', text: 'Ready' }

  return (
    <div className="shell">
      <AmbientBackground />
      <header className="topbar">
        <span className="uae-bar uae-bar--edge" aria-hidden />
        <div className="topbar__inner">
          <div className="brand">
            <LogoMark />
            <div className="brand__text">
              <span className="brand__name">
                ComplyRisk<span className="brand__ai">AI</span>
              </span>
              <span className="brand__tag">Compliance exposure as a CFO number</span>
            </div>
          </div>
          <div className="topbar__right">
            <span className={`status-pill status-pill--${status.tone}`}>
              <span className="status-pill__dot" aria-hidden />
              {status.text}
            </span>
            {phase.kind === 'done' && <ExportButton result={phase.result} />}
          </div>
        </div>
      </header>

      <main className="app">
        <section className={`intro${phase.kind === 'idle' ? '' : ' intro--compact'}`}>
          {phase.kind === 'idle' && (
            <>
              <p className="eyebrow">Live privacy-posture audit</p>
              <h1 className="intro__title">
                What is your privacy policy <em>actually</em> costing you?
              </h1>
              <p className="intro__lede">
                One live pass scrapes your site, scores 14 UAE-first legal rules with
                calibrated probabilities, and prices the exposure in USD and AED.
              </p>
            </>
          )}
          <AuditForm onSubmit={submit} busy={phase.kind === 'loading'} />
          {phase.kind === 'idle' && (
            <ul className="frameworks" aria-label="Frameworks covered">
              {FRAMEWORKS.map((f) => (
                <li key={f} className="frameworks__item">
                  {f}
                </li>
              ))}
            </ul>
          )}
          {phase.kind === 'idle' && <RegulatorStrip variant="intro" />}
        </section>

        {phase.kind === 'loading' && (
          <div className="phase" key="loading">
            <ScanStages />
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="phase" key="error">
            <div className="error-panel" role="alert">
              <div className="error-panel__icon" aria-hidden>
                !
              </div>
              <div className="error-panel__body">
                <div className="error-panel__title">
                  {ERROR_TITLE[phase.code] ?? 'The audit couldn’t complete'}
                  <span className="error-panel__code">{phase.code}</span>
                </div>
                <p className="error-panel__msg">{phase.message}</p>
                {lastRequest && (
                  <p className="error-panel__target">
                    Target: <span className="mono">{hostOf(lastRequest.url)}</span>
                  </p>
                )}
                {phase.retryable && lastRequest && (
                  <button
                    className="btn btn--primary error-panel__retry"
                    onClick={() => submit(lastRequest.url, lastRequest.revenue)}
                  >
                    ↻ Retry audit
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="phase results" key={`done-${phase.result.url}`}>
            <div className="results__target">
              <span className="eyebrow">Audit report</span>
              <span className="results__host mono">{hostOf(phase.result.url)}</span>
              <span className="results__pages">
                {phase.result.pages_scraped.length} page
                {phase.result.pages_scraped.length === 1 ? '' : 's'} analysed
              </span>
              <span className="results__cta">
                <FixReportButton result={phase.result} />
              </span>
            </div>
            <ExposureCallout result={phase.result} />
            <ExposureChart result={phase.result}>
              <BriefingVoice result={phase.result} />
            </ExposureChart>
            <ExposureInsights result={phase.result} />
            <ViolationGrid violations={phase.result.violations} url={phase.result.url} />
            <BriefingPanel briefing_md={phase.result.briefing_md} />
          </div>
        )}
      </main>

      <footer className="footer">
        {phase.kind !== 'idle' && (
          <div className="footer__regs">
            <RegulatorStrip variant="footer" />
          </div>
        )}
        <div className="footer__inner">
          <span className="footer__mark">
            <LogoMark /> ComplyRisk AI
          </span>
          <div className="footer__text">
            <p className="footer__built">
              <span className="uae-bar" aria-hidden />
              Built for UAE compliance — PDPL &amp; DIFC first, EU GDPR as expansion risk.
            </p>
            <p className="footer__disclaimer">
              Screening signal for prioritization — not legal advice. Figures are
              modeled exposure: statutory frameworks where published, analyst
              estimates where not. AED at the fixed 3.673 peg. Regulator names are
              references only; no affiliation or endorsement implied.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
