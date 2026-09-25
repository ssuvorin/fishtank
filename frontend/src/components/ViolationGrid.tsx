import type { Severity, ViolationResult } from '../api'
import { basisKind, basisLabel, fmtAed, fmtUsd } from '../format'

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM']

function isAbsenceStatement(quote: string): boolean {
  const q = quote.trim().toLowerCase()
  return (
    q.startsWith('the policy omits') ||
    q.startsWith('no ') && q.includes('found') ||
    q.includes('omits ') ||
    q.includes('not found')
  )
}

function ViolationCard({ v }: { v: ViolationResult }) {
  const kind = basisKind(v.basis)
  const absent = !v.flagged || isAbsenceStatement(v.evidence_quote)
  return (
    <article className={`v-card v-card--${v.severity.toLowerCase()}`}>
      <header className="v-card__head">
        <span className="v-card__category">{v.category}</span>
        <span className={`badge badge--${kind}`} title={v.basis}>
          {basisLabel(v.basis)}
        </span>
      </header>
      <div className="v-card__law">{v.law}</div>
      <div className="v-card__chips">
        {v.articles.map((a) => (
          <span className="chip" key={a}>
            {a}
          </span>
        ))}
      </div>
      <div className="v-card__stats">
        <div className="v-card__prob">
          <span className="v-card__prob-num">
            {Math.round(v.probability * 100)}%
          </span>
          <span className="v-card__prob-label">violation probability</span>
          <span className="v-card__prob-bar">
            <span
              className="v-card__prob-fill"
              style={{ width: `${Math.round(v.probability * 100)}%` }}
            />
          </span>
        </div>
        <div className="v-card__exposure">
          <span className="v-card__exposure-usd">{fmtUsd(v.exposure_usd)}</span>
          <span className="v-card__exposure-aed">{fmtAed(v.exposure_aed)}</span>
        </div>
      </div>
      {v.evidence_quote && (
        <blockquote className={`v-card__quote${absent ? ' v-card__quote--absent' : ''}`}>
          {absent ? (
            <span className="v-card__absent-tag">policy omits — </span>
          ) : null}
          {v.evidence_quote}
        </blockquote>
      )}
      <div className="v-card__remediation">
        <span className="v-card__remediation-label">Remediation</span>
        <p>{v.remediation}</p>
      </div>
    </article>
  )
}

export default function ViolationGrid({
  violations,
}: {
  violations: ViolationResult[]
}) {
  const flagged = violations.filter((v) => v.flagged)
  const compliant = violations.filter((v) => !v.flagged)

  return (
    <section className="violation-section">
      {SEVERITY_ORDER.map((sev) => {
        const group = flagged.filter((v) => v.severity === sev)
        if (group.length === 0) return null
        return (
          <div key={sev} className="severity-group">
            <h3 className={`severity-group__title severity-group__title--${sev.toLowerCase()}`}>
              {sev}
              <span className="severity-group__count">{group.length}</span>
            </h3>
            <div className="violation-grid">
              {group.map((v) => (
                <ViolationCard key={v.id} v={v} />
              ))}
            </div>
          </div>
        )
      })}

      {compliant.length > 0 && (
        <div className="severity-group severity-group--compliant">
          <h3 className="severity-group__title severity-group__title--compliant">
            Compliant / below flag threshold
            <span className="severity-group__count">{compliant.length}</span>
          </h3>
          <ul className="compliant-list">
            {compliant.map((v) => (
              <li key={v.id} className="compliant-list__item">
                <span className="compliant-list__check">✓</span>
                <span className="compliant-list__cat">{v.category}</span>
                <span className="compliant-list__prob">
                  {Math.round(v.probability * 100)}%
                </span>
                <span className="compliant-list__law">{v.law}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
