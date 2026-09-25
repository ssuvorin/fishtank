import { useState } from 'react'
import { AuditApiError, runAudit } from './api'
import type { AuditResponse } from './api'
import AuditForm from './components/AuditForm'
import ScanStages from './components/ScanStages'
import ExposureCallout from './components/ExposureCallout'
import ViolationGrid from './components/ViolationGrid'
import BriefingPanel from './components/BriefingPanel'
import ExportButton from './components/ExportButton'

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: AuditResponse }
  | { kind: 'error'; message: string; code: string; retryable: boolean }

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
          retryable:
            err.status === 503 || err.status === 504 || err.code === 'network_error',
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

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo">◈</span>
          <div>
            <h1 className="app__title">ComplyRisk AI</h1>
            <p className="app__subtitle">
              Compliance as a CFO number — UAE PDPL · DIFC · GDPR exposure audit
            </p>
          </div>
        </div>
        {phase.kind === 'done' && <ExportButton result={phase.result} />}
      </header>

      <main className="app__main">
        <AuditForm onSubmit={submit} busy={phase.kind === 'loading'} />

        {phase.kind === 'loading' && <ScanStages />}

        {phase.kind === 'error' && (
          <div className="error-panel" role="alert">
            <div className="error-panel__title">
              Audit failed
              <span className="error-panel__code">{phase.code}</span>
            </div>
            <p className="error-panel__msg">{phase.message}</p>
            {phase.retryable && lastRequest && (
              <button
                className="error-panel__retry"
                onClick={() => submit(lastRequest.url, lastRequest.revenue)}
              >
                Retry audit
              </button>
            )}
          </div>
        )}

        {phase.kind === 'done' && (
          <>
            <ExposureCallout result={phase.result} />
            <ViolationGrid violations={phase.result.violations} />
            <BriefingPanel briefing_md={phase.result.briefing_md} />
          </>
        )}

        {phase.kind === 'idle' && (
          <p className="app__empty">
            Enter a URL to audit its privacy posture against 10 UAE-first legal
            rules. One live pass — no cached results.
          </p>
        )}
      </main>

      <footer className="app__footer">
        Screening signal for prioritization — not legal advice. Figures are
        modeled exposure: statutory frameworks where published, analyst
        estimates where not. AED at the fixed 3.673 peg.
      </footer>
    </div>
  )
}
