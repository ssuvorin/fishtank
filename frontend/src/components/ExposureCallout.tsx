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

  return (
    <section className="exposure-callout">
      <div className="exposure-callout__label">Potential Penalty Exposure</div>
      <div className="exposure-callout__usd">{fmtUsd(exposure.usd)}</div>
      <div className="exposure-callout__aed">{fmtAed(exposure.aed)}</div>
      <div className="exposure-callout__meta">
        <span className={`badge badge--${basis}`}>{basisText}</span>
        <span>
          {flagged.length} of {violations.length} rules flagged · revenue{' '}
          {revenue_assumed ? 'assumed' : 'declared'} at {fmtUsd(revenue_used)}
        </span>
      </div>
      {limited_coverage && (
        <p className="exposure-callout__warning">
          Limited coverage — the privacy policy page could not be fetched;
          findings are based on the landing page only.
        </p>
      )}
      <p className="exposure-callout__disclaimer">
        Modeled screening signal — not legal advice. AED at the fixed 3.673
        peg.
      </p>
    </section>
  )
}
