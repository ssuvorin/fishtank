import { useEffect, useState } from 'react'

/**
 * Cosmetic stage indicator. The backend is a single POST — these stages are
 * driven by elapsed-time heuristics, not real pipeline events. They orient
 * the viewer while the one network call is in flight; they do NOT claim to
 * report real backend progress.
 */
const STAGES: { label: string; until: number }[] = [
  { label: 'Scraping landing page & discovering privacy policy', until: 10 },
  { label: 'Scoring 10 legal rules (Jev calibrated probabilities)', until: 55 },
  { label: 'Computing penalty exposure', until: 65 },
  { label: 'Drafting executive briefing', until: Infinity },
]

export default function ScanStages() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t0 = Date.now()
    const tick = setInterval(
      () => setElapsed((Date.now() - t0) / 1000),
      200,
    )
    return () => clearInterval(tick)
  }, [])

  const activeIdx = STAGES.findIndex((s) => elapsed < s.until)

  return (
    <div className="scan-stages" role="status" aria-live="polite">
      <div className="scan-stages__header">
        <span className="scan-stages__pulse" aria-hidden />
        <span>Audit in progress — {elapsed.toFixed(0)}s elapsed</span>
      </div>
      <ol className="scan-stages__list">
        {STAGES.map((s, i) => {
          const state =
            i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
          return (
            <li key={s.label} className={`scan-stage scan-stage--${state}`}>
              <span className="scan-stage__dot" aria-hidden />
              <span className="scan-stage__label">{s.label}</span>
              {state === 'done' && <span className="scan-stage__check">✓</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
