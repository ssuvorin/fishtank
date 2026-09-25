import { useRef } from 'react'
import type { Severity, ViolationResult } from '../api'
import { basisKind, basisLabel, fmtAed, fmtUsd, isAbsenceStatement } from '../format'
import { useStaggerIn } from '../motion'
import { FixViolationButton } from './FixPrompt'
import JurisdictionTags from './JurisdictionTag'

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM']

const SEVERITY_BLURB: Record<Severity, string> = {
  CRITICAL: 'Act this quarter',
  HIGH: 'Schedule remediation',
  MEDIUM: 'Monitor & tidy up',
}

/** Evidence quotes can be raw script/style dumps; render those as code, not prose. */
const CODE_STRONG =
  /[{}]|=>|\bfunction\s*[\w$]*\s*\(|\b(?:var|let|const)\s+[\w$]+\s*=|\b(?:document|window)\.|<\/?script|!important/

function isCodeLike(s: string): boolean {
  if (CODE_STRONG.test(s)) return true
  const punct = (s.match(/[;=]/g) ?? []).length
  if (punct >= 3) return true
  // obfuscated/minified blobs: very long unbroken tokens
  return s.split(/\s+/).some((w) => w.length > 40)
}

function ViolationCard({ v, url }: { v: ViolationResult; url: string }) {
  const kind = basisKind(v.basis)
  const quote = v.evidence_quote?.trim() ?? ''
  const absent = !v.flagged || isAbsenceStatement(quote)
  const code = !absent && quote !== '' && isCodeLike(quote)
  const pct = Math.round(v.probability * 100)
  return (
    <article className={`v-card v-card--${v.severity.toLowerCase()}`}>
      <header className="v-card__head">
        <div className="v-card__titles">
          <h4 className="v-card__category">{v.category}</h4>
          <div className="v-card__meta">
            <span className="v-card__law">{v.law}</span>
            <JurisdictionTags law={v.law} />
          </div>
        </div>
        <span className={`badge badge--${kind} v-card__basis`} title={v.basis}>
          <span className="badge__dot" aria-hidden />
          {basisLabel(v.basis)}
        </span>
      </header>

      {v.articles.length > 0 && (
        <div className="v-card__chips">
          {v.articles.map((a) => (
            <span className="chip" key={a}>
              {a}
            </span>
          ))}
        </div>
      )}

      <div className="v-card__stats">
        <div className="v-card__stat v-card__prob">
          <span className="v-card__stat-label">Probability</span>
          <span className="v-card__prob-num mono">{pct}%</span>
          <span className="v-card__prob-bar" aria-hidden>
            <span className="v-card__prob-fill" style={{ width: `${pct}%` }} />
            <span className="v-card__prob-threshold" title="Flag threshold 50%" />
          </span>
        </div>
        <div className="v-card__stat v-card__exposure">
          <span className="v-card__stat-label">Exposure</span>
          <span className="v-card__exposure-usd">{fmtUsd(v.exposure_usd)}</span>
          <span className="v-card__exposure-aed mono">{fmtAed(v.exposure_aed)}</span>
        </div>
      </div>

      {quote !== '' && (
        <figure
          className={`v-card__quote${absent ? ' v-card__quote--absent' : ''}${
            code ? ' v-card__quote--code' : ''
          }`}
        >
          <figcaption className="v-card__cap">
            {absent ? 'Gap identified' : code ? 'Evidence · page source' : 'Evidence from site'}
          </figcaption>
          {code ? (
            <pre className="v-card__code" title={quote}>
              <code>{quote}</code>
            </pre>
          ) : (
            <blockquote className="v-card__prose" title={quote}>
              {quote}
            </blockquote>
          )}
        </figure>
      )}

      <div className="v-card__remediation">
        <span className="v-card__cap v-card__cap--ok">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
            <path
              d="M3 8.5l3 3 7-7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Remediation
        </span>
        <p>{v.remediation}</p>
      </div>

      {v.flagged && (
        <div className="v-card__actions">
          <FixViolationButton v={v} url={url} />
        </div>
      )}
    </article>
  )
}

export default function ViolationGrid({
  violations,
  url,
}: {
  violations: ViolationResult[]
  url: string
}) {
  const flagged = violations.filter((v) => v.flagged)
  const compliant = violations.filter((v) => !v.flagged)
  const ref = useRef<HTMLElement>(null)
  useStaggerIn(ref, '.sev-group__head, .v-card', [violations], { step: 75, start: 250 })

  return (
    <section className="violations" ref={ref}>
      <header className="section-head">
        <h2 className="section-head__title">Findings</h2>
        <span className="section-head__meta">
          {flagged.length} flagged · {compliant.length} clear · sorted by severity
        </span>
      </header>

      {flagged.length === 0 && (
        <div className="all-clear">
          <span className="all-clear__icon" aria-hidden>
            ✓
          </span>
          No rules crossed the 50% flag threshold on this pass.
        </div>
      )}

      {SEVERITY_ORDER.map((sev) => {
        const group = flagged.filter((v) => v.severity === sev)
        if (group.length === 0) return null
        const groupUsd = group.reduce((s, v) => s + v.exposure_usd, 0)
        return (
          <div key={sev} className={`sev-group sev-group--${sev.toLowerCase()}`}>
            <h3 className="sev-group__head">
              <span className="sev-group__pill">
                <span className="sev-group__dot" aria-hidden />
                {sev}
              </span>
              <span className="sev-group__count">
                {group.length} finding{group.length === 1 ? '' : 's'}
              </span>
              <span className="sev-group__blurb">{SEVERITY_BLURB[sev]}</span>
              <span className="sev-group__rule" aria-hidden />
              <span className="sev-group__usd mono">{fmtUsd(groupUsd)}</span>
            </h3>
            <div className="v-grid">
              {group.map((v) => (
                <ViolationCard key={v.id} v={v} url={url} />
              ))}
            </div>
          </div>
        )
      })}

      {compliant.length > 0 && (
        <details className="compliant">
          <summary className="compliant__summary">
            <span className="compliant__check" aria-hidden>
              ✓
            </span>
            <span className="compliant__title">Compliant / below flag threshold</span>
            <span className="compliant__count">{compliant.length}</span>
            <span className="compliant__chev" aria-hidden />
          </summary>
          <ul className="compliant__list">
            {compliant.map((v) => (
              <li key={v.id} className="compliant__item">
                <span className="compliant__cat">{v.category}</span>
                <span className="compliant__law">{v.law}</span>
                <span className="compliant__bar" aria-hidden>
                  <span style={{ width: `${Math.round(v.probability * 100)}%` }} />
                </span>
                <span className="compliant__prob mono">
                  {Math.round(v.probability * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
