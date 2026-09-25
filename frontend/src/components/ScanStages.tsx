import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { prefersReducedMotion, useStaggerIn } from '../motion'

/**
 * Cosmetic stage indicator. The backend is a single POST — these stages are
 * driven by elapsed-time heuristics, not real pipeline events. They orient
 * the viewer while the one network call is in flight; they do NOT claim to
 * report real backend progress.
 */
const STAGES: { key: string; title: string; detail: string; until: number }[] = [
  {
    key: 'scrape',
    title: 'Scraping',
    detail: 'Landing page & privacy-policy discovery',
    until: 10,
  },
  {
    key: 'score',
    title: 'Jev scoring',
    detail: '14 legal rules · calibrated probabilities',
    until: 55,
  },
  {
    key: 'estimate',
    title: 'Estimating',
    detail: 'Penalty exposure in USD & AED',
    until: 65,
  },
  {
    key: 'draft',
    title: 'Drafting',
    detail: 'Executive briefing narrative',
    until: Infinity,
  },
]

export default function ScanStages() {
  const [elapsed, setElapsed] = useState(0)
  const ref = useRef<HTMLElement>(null)
  useStaggerIn(ref, '.step, .skeleton', [], { step: 90, distance: 12 })

  useEffect(() => {
    const t0 = Date.now()
    const tick = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200)
    return () => clearInterval(tick)
  }, [])

  const activeIdx = STAGES.findIndex((s) => elapsed < s.until)
  // Asymptotic cosmetic bar: tracks the heuristic stage windows, never hits 100%.
  const progress = Math.min(96, (1 - Math.exp(-elapsed / 28)) * 100)

  // Stage transition: pop the newly active node.
  useLayoutEffect(() => {
    const node = ref.current?.querySelectorAll('.step__node')[activeIdx]
    if (!node || prefersReducedMotion()) return
    const a = animate(node, {
      scale: [0.6, 1],
      duration: 700,
      ease: 'outElastic(1, .6)',
    })
    return () => {
      a.revert()
    }
  }, [activeIdx])

  return (
    <section className="scan" role="status" aria-live="polite" ref={ref}>
      <header className="scan__head">
        <div className="scan__title">
          <span className="scan__pulse" aria-hidden />
          Audit in progress
        </div>
        <span className="scan__timer mono">
          {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
          {String(Math.floor(elapsed % 60)).padStart(2, '0')}
        </span>
      </header>

      <div className="scan__bar" aria-hidden>
        <span className="scan__bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <ol className="scan__steps">
        {STAGES.map((s, i) => {
          const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
          return (
            <li key={s.key} className={`step step--${state}`}>
              <span className="step__node" aria-hidden>
                {state === 'done' ? (
                  <svg viewBox="0 0 16 16" width="14" height="14">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span className="step__num">{i + 1}</span>
                )}
              </span>
              <span className="step__text">
                <span className="step__title">{s.title}</span>
                <span className="step__detail">{s.detail}</span>
              </span>
              <span className="step__state">
                {state === 'done' ? 'Done' : state === 'active' ? 'Running' : 'Queued'}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="scan__skeleton" aria-hidden>
        <div className="skeleton skeleton--hero" />
        <div className="scan__skeleton-grid">
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--card" />
        </div>
      </div>
      <p className="scan__note">
        Stage timing is indicative — the audit runs as one live request.
      </p>
    </section>
  )
}
