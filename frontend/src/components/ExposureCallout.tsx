import { useEffect, useState } from 'react'
import type { AuditResponse, ViolationResult } from '../api'
import { basisKind, fmtAed, fmtUsd } from '../format'

interface Props {
  result: AuditResponse
}

function worstBasis(violations: ViolationResult[]): 'statutory' | 'mixed' | 'estimate' {
  // Precedence: statutory beats mixed beats estimate — a headline figure that
  // includes any statutory exposure is labeled statutory, etc. Only flagged
  // items contribute to the total.
  let rank: 0 | 1 | 2 = 2 // assume estimate until contradicted
  for (const v of violations) {
    if (!v.flagged) continue
    const k = basisKind(v.basis)
    if (k === 'statutory') return 'statutory'
    if (k === 'mixed') rank = Math.min(rank, 1) as 0 | 1 | 2
  }
  return rank === 1 ? 'mixed' : 'estimate'
}

/** Eased 0→1 progress over `ms`, restarted whenever `key` changes. */
function useCountUp(key: unknown, ms = 1600): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setT(1)
      return
    }
    setT(0)
    let raf = 0
    const start = performance.now()
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      setT(1 - Math.pow(1 - p, 4)) // easeOutQuart
      if (p < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [key, ms])
  return t
}

const SEV_KEYS = ['CRITICAL', 'HIGH', 'MEDIUM'] as const

export default function ExposureCallout({ result }: Props) {
  const { exposure, violations, revenue_used, revenue_assumed, limited_coverage } =
    result
  const flagged = violations.filter((v) => v.flagged)
  const basis = worstBasis(violations)
  const basisText =
    basis === 'statutory'
      ? 'includes statutory penalty frameworks'
      : basis === 'mixed'
        ? 'statutory + analyst-estimated components'
        : 'analyst estimates — UAE PDPL fine schedule unpublished'
  const t = useCountUp(result)

  const sevTotals = SEV_KEYS.map((sev) => ({
    sev,
    usd: flagged.filter((v) => v.severity === sev).reduce((s, v) => s + v.exposure_usd, 0),
    count: flagged.filter((v) => v.severity === sev).length,
  }))
  const sevSum = sevTotals.reduce((s, x) => s + x.usd, 0)

  return (
    <section className={`hero hero--${basis}`}>
      <div className="hero__main">
        <div className="hero__label">
          <span className="eyebrow">Potential penalty exposure</span>
          <span className={`badge badge--${basis}`} title="Penalty provenance">
            <span className="badge__dot" aria-hidden />
            {basisText}
          </span>
        </div>
        <div className="hero__usd" aria-label={fmtUsd(exposure.usd)}>
          {fmtUsd(Math.round(exposure.usd * t))}
        </div>
        <div className="hero__aed">
          ≈ {fmtAed(Math.round(exposure.aed * t))}
        </div>

        {sevSum > 0 && (
          <div className="hero__split">
            <div className="hero__split-bar" aria-hidden>
              {sevTotals.map(
                (x) =>
                  x.usd > 0 && (
                    <span
                      key={x.sev}
                      className={`hero__split-seg sev-bg--${x.sev.toLowerCase()}`}
                      style={{ flexGrow: x.usd }}
                    />
                  ),
              )}
            </div>
            <ul className="hero__split-legend">
              {sevTotals.map(
                (x) =>
                  x.count > 0 && (
                    <li key={x.sev}>
                      <span className={`dot sev-bg--${x.sev.toLowerCase()}`} aria-hidden />
                      <span className="hero__split-sev">{x.sev}</span>
                      <span className="mono">{fmtUsd(x.usd)}</span>
                    </li>
                  ),
              )}
            </ul>
          </div>
        )}
      </div>

      <dl className="hero__stats">
        <div className="stat">
          <dt>Rules flagged</dt>
          <dd>
            <span className="stat__big">{flagged.length}</span>
            <span className="stat__of">/ {violations.length}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Revenue basis</dt>
          <dd>
            <span className="stat__mid mono">{fmtUsd(revenue_used)}</span>
            <span className={`tag ${revenue_assumed ? 'tag--warn' : 'tag--ok'}`}>
              {revenue_assumed ? 'Assumed default' : 'Declared'}
            </span>
          </dd>
        </div>
        <div className="stat">
          <dt>Coverage</dt>
          <dd>
            <span className="stat__mid">{limited_coverage ? 'Limited' : 'Full'}</span>
            <span className={`tag ${limited_coverage ? 'tag--warn' : 'tag--ok'}`}>
              {result.pages_scraped.length} page{result.pages_scraped.length === 1 ? '' : 's'}
            </span>
          </dd>
        </div>
      </dl>

      {revenue_assumed && (
        <p className="hero__note">
          No revenue supplied — turnover-scaled frameworks use the USD 5,000,000
          default. Declare revenue for a sharper figure.
        </p>
      )}
      {limited_coverage && (
        <p className="hero__note hero__note--warn">
          Limited coverage — the privacy policy page could not be fetched;
          findings are based on the landing page only.
        </p>
      )}
      <p className="hero__disclaimer">
        Modeled screening signal — not legal advice. AED at the fixed 3.673 peg.
      </p>
    </section>
  )
}
