import { useLayoutEffect, useRef } from 'react'
import { animate } from 'animejs'
import type { AuditResponse, ViolationResult } from '../api'
import { basisKind, fmtAed, fmtUsd } from '../format'
import { prefersReducedMotion } from '../motion'

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
  const usdRef = useRef<HTMLDivElement>(null)
  const aedRef = useRef<HTMLDivElement>(null)

  // anime.js count-up: tween a plain object and write text directly — no
  // React re-render per frame.
  useLayoutEffect(() => {
    const usdEl = usdRef.current
    const aedEl = aedRef.current
    if (!usdEl || !aedEl) return
    const paint = (k: number) => {
      usdEl.textContent = fmtUsd(Math.round(exposure.usd * k))
      aedEl.textContent = `≈ ${fmtAed(Math.round(exposure.aed * k))}`
    }
    if (prefersReducedMotion()) {
      paint(1)
      return
    }
    const state = { k: 0 }
    paint(0)
    const anim = animate(state, {
      k: 1,
      duration: 2000,
      delay: 150,
      ease: 'outExpo',
      onUpdate: () => paint(state.k),
    })
    return () => {
      anim.cancel()
    }
  }, [exposure.usd, exposure.aed])

  const ratio = revenue_used > 0 ? exposure.usd / revenue_used : 0
  const top = flagged.reduce<ViolationResult | null>(
    (m, v) => (m && m.exposure_usd >= v.exposure_usd ? m : v),
    null,
  )

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
        {/* Text is owned by the count-up effect (painted before first frame). */}
        <div className="hero__usd" ref={usdRef} aria-label={fmtUsd(exposure.usd)} />
        <div className="hero__aed" ref={aedRef} />
        {flagged.length > 0 && revenue_used > 0 && (
          <p className="hero__meaning">
            <strong>
              ≈ {ratio < 0.001 ? '<0.1' : (ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}% of{' '}
              {revenue_assumed ? 'assumed' : 'declared'} annual revenue
            </strong>{' '}
            at regulatory risk
            {top && (
              <>
                {' '}
                — largest single driver: <em>{top.category}</em> ({fmtUsd(top.exposure_usd)})
              </>
            )}
            .
          </p>
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
