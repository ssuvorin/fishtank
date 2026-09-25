import { useLayoutEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import type { AuditResponse, Severity } from '../api'
import type { Jurisdiction } from '../format'
import { JURISDICTION_LABEL, fmtUsd, jurisdictionsOf } from '../format'
import { prefersReducedMotion } from '../motion'

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM']
const JURISDICTIONS: Jurisdiction[] = ['uae', 'difc', 'eu']

/** Gauge full-scale: 8% of revenue, with GDPR's upper tier (4%, Art. 83(5)) at mid-dial. */
const GAUGE_MAX = 0.08
const GDPR_TIER = 0.04

function pctLabel(r: number): string {
  if (r === 0) return '0%'
  if (r < 0.001) return '<0.1%'
  return `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`
}

export default function ExposureInsights({ result }: { result: AuditResponse }) {
  const ref = useRef<HTMLDivElement>(null)
  const flagged = result.violations.filter((v) => v.flagged)
  const total = flagged.reduce((s, v) => s + v.exposure_usd, 0)

  const bySev = SEVERITIES.map((sev) => {
    const group = flagged.filter((v) => v.severity === sev)
    return { sev, count: group.length, usd: group.reduce((s, v) => s + v.exposure_usd, 0) }
  })

  // Exposure of every flagged finding whose law cites the jurisdiction.
  // Overlapping by design: a PDPL + GDPR finding counts toward both.
  const byJur = JURISDICTIONS.map((j) => {
    const group = flagged.filter((v) => jurisdictionsOf(v.law).includes(j))
    return { j, cited: group.length, usd: group.reduce((s, v) => s + v.exposure_usd, 0) }
  })

  const ratio = result.revenue_used > 0 ? result.exposure.usd / result.revenue_used : 0
  const dial = Math.min(ratio / GAUGE_MAX, 1) * 100
  const band = ratio >= GDPR_TIER ? 'severe' : ratio >= 0.01 ? 'elevated' : 'contained'

  let acc = 0
  const segments = bySev
    .filter((x) => x.usd > 0)
    .map((x) => {
      const len = total > 0 ? (x.usd / total) * 100 : 0
      const seg = { ...x, len, start: acc }
      acc += len
      return seg
    })

  useLayoutEffect(() => {
    const root = ref.current
    if (!root || prefersReducedMotion()) return
    const anims = [
      animate(root.querySelectorAll('.donut__seg'), {
        strokeDasharray: (el: unknown) => [
          '0 100',
          (el as SVGElement).getAttribute('stroke-dasharray') ?? '0 100',
        ],
        duration: 1300,
        delay: stagger(160, { start: 500 }),
        ease: 'outQuart',
      }),
      animate(root.querySelectorAll('.gauge__value'), {
        strokeDasharray: ['0 100', `${dial} 100`],
        duration: 1800,
        delay: 600,
        ease: 'outExpo',
      }),
      animate(root.querySelectorAll('.gauge__needle'), {
        rotate: [-90, -90 + (dial / 100) * 180],
        duration: 1800,
        delay: 600,
        ease: 'outElastic(1, .7)',
      }),
      animate(root.querySelectorAll('.jur-row__fill'), {
        scaleX: [0, 1],
        duration: 1200,
        delay: stagger(120, { start: 700 }),
        ease: 'outExpo',
      }),
    ]
    return () => anims.forEach((a) => a.revert())
  }, [result, dial])

  if (flagged.length === 0) return null

  return (
    <section className="insights" ref={ref} aria-label="Exposure breakdown">
      <article className="insight">
        <header className="insight__head">
          <span className="eyebrow">Exposure by severity</span>
        </header>
        <div className="donut-wrap">
          <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="Exposure share by severity">
            <circle className="donut__track" cx="60" cy="60" r="46" pathLength={100} />
            {segments.map((s) => (
              <circle
                key={s.sev}
                className={`donut__seg donut__seg--${s.sev.toLowerCase()}`}
                cx="60"
                cy="60"
                r="46"
                pathLength={100}
                strokeDasharray={`${Math.max(s.len - 0.8, 0.4)} 100`}
                strokeDashoffset={-s.start}
              />
            ))}
          </svg>
          <div className="donut__center">
            <span className="donut__num">{flagged.length}</span>
            <span className="donut__cap">flagged</span>
          </div>
        </div>
        <ul className="insight__legend">
          {bySev.map(
            (x) =>
              x.count > 0 && (
                <li key={x.sev}>
                  <span className={`dot sev-bg--${x.sev.toLowerCase()}`} aria-hidden />
                  <span className="insight__legend-k">{x.sev}</span>
                  <span className="insight__legend-n">×{x.count}</span>
                  <span className="insight__legend-v mono">{fmtUsd(x.usd)}</span>
                  <span className="insight__legend-p mono">
                    {total > 0 ? Math.round((x.usd / total) * 100) : 0}%
                  </span>
                </li>
              ),
          )}
        </ul>
      </article>

      <article className={`insight insight--gauge gauge--${band}`}>
        <header className="insight__head">
          <span className="eyebrow">Risk vs revenue basis</span>
          <span className={`tag ${result.revenue_assumed ? 'tag--warn' : 'tag--ok'}`}>
            {result.revenue_assumed ? 'Assumed' : 'Declared'}
          </span>
        </header>
        <svg className="gauge" viewBox="0 0 200 118" role="img" aria-label={`Exposure is ${pctLabel(ratio)} of revenue`}>
          <defs>
            <linearGradient id="gauge-g" x1="0" x2="1">
              <stop offset="0" stopColor="#3ddc97" />
              <stop offset="0.45" stopColor="#f5b544" />
              <stop offset="1" stopColor="#ff5a67" />
            </linearGradient>
          </defs>
          <path className="gauge__track" d="M20 100 A80 80 0 0 1 180 100" pathLength={100} />
          <path
            className="gauge__value"
            d="M20 100 A80 80 0 0 1 180 100"
            pathLength={100}
            strokeDasharray={`${dial} 100`}
          />
          {/* GDPR 4% tier tick at 50% of the dial (top centre) */}
          <line className="gauge__tick" x1="100" y1="12" x2="100" y2="28" />
          <g className="gauge__needle" style={{ transform: `rotate(${-90 + (dial / 100) * 180}deg)` }}>
            <line x1="100" y1="100" x2="100" y2="34" />
            <circle cx="100" cy="100" r="5" />
          </g>
        </svg>
        <div className="gauge__readout">
          <span className="gauge__pct">{pctLabel(ratio)}</span>
          <span className="gauge__of">
            of {fmtUsd(result.revenue_used)} annual revenue
          </span>
        </div>
        <div className="gauge__scale mono" aria-hidden>
          <span>0%</span>
          <span>GDPR max tier · 4%</span>
          <span>≥8%</span>
        </div>
      </article>

      <article className="insight">
        <header className="insight__head">
          <span className="eyebrow">Exposure by jurisdiction</span>
          <span className="uae-bar" aria-hidden />
        </header>
        <ul className="jur-list">
          {byJur.map((x) => (
            <li key={x.j} className={`jur-row jur-row--${x.j}${x.cited === 0 ? ' jur-row--none' : ''}`}>
              <div className="jur-row__top">
                <span className={`juris juris--${x.j}`}>
                  {x.j !== 'eu' && <span className="uae-bar uae-bar--v" aria-hidden />}
                  {JURISDICTION_LABEL[x.j]}
                </span>
                <span className="jur-row__usd mono">{fmtUsd(x.usd)}</span>
              </div>
              <span className="jur-row__bar" aria-hidden>
                <span
                  className="jur-row__fill"
                  style={{ width: `${total > 0 ? (x.usd / total) * 100 : 0}%` }}
                />
              </span>
              <span className="jur-row__meta">
                {total > 0 ? Math.round((x.usd / total) * 100) : 0}% of total · cited in {x.cited} finding{x.cited === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
        <p className="insight__foot">
          Findings citing several regimes count toward each — rows overlap.
        </p>
      </article>
    </section>
  )
}
