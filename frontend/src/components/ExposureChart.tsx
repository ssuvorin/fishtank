import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { AuditResponse, Severity, ViolationResult } from '../api'
import { JURISDICTION_LABEL, fmtUsd, jurisdictionsOf } from '../format'
import { prefersReducedMotion } from '../motion'
import { narrationBus } from '../narrationBus'

/**
 * Exposure by rule: gradient bar per flagged rule on a shared USD axis,
 * grouped by severity, with a stacked severity-share strip on top and the
 * clear / not-applicable rules as chips underneath. Clicking a row opens the
 * finding card; while the ElevenLabs briefing plays, the row being read is lit.
 */

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM']
const SEV_LABEL: Record<Severity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
}

/** 0 / 50k / 100k / 150k — a "nice" step giving 3-5 gridlines. */
function niceTicks(max: number): number[] {
  const raw = Math.max(max, 1) / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const top = Math.ceil(max / step) * step || step
  const out: number[] = []
  for (let t = 0; t <= top + 1e-6; t += step) out.push(t)
  return out
}

function shortUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

/** Rule currently being read by the voice briefing (polled, not per-frame state). */
function useSpokenRule(): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let raf = 0
    let last: string | null = null
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = narrationBus.playing ? narrationBus.activeRuleId : null
      if (now !== last) {
        last = now
        setId(now)
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return id
}

function openFinding(id: string) {
  const card = document.getElementById(`finding-${id}`)
  if (!card) return
  card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
  card.classList.remove('v-card--flash')
  void card.offsetWidth
  card.classList.add('v-card--flash')
}

export default function ExposureChart({
  result,
  children,
}: {
  result: AuditResponse
  /** Rendered at the foot of the card — the voiced-briefing player. */
  children?: ReactNode
}) {
  const spoken = useSpokenRule()
  const data = useMemo(() => {
    const vs = result.violations
    const flagged = vs.filter((v) => v.flagged)
    const clear = vs.filter((v) => !v.flagged && v.applicable !== false)
    const na = vs.filter((v) => v.applicable === false)
    const ticks = niceTicks(Math.max(0, ...flagged.map((v) => v.exposure_usd)))
    const top = ticks[ticks.length - 1]
    const total = flagged.reduce((s, v) => s + v.exposure_usd, 0)
    const catCount = new Map<string, number>()
    vs.forEach((v) => catCount.set(v.category, (catCount.get(v.category) ?? 0) + 1))
    const label = (v: ViolationResult) => {
      const j = jurisdictionsOf(v.law)[0]
      return (catCount.get(v.category) ?? 0) > 1 && j ? `${v.category} · ${JURISDICTION_LABEL[j]}` : v.category
    }
    const groups = SEVERITIES.map((sev) => {
      const rows = flagged
        .filter((v) => v.severity === sev)
        .sort((a, b) => b.exposure_usd - a.exposure_usd)
      return { sev, rows, usd: rows.reduce((s, v) => s + v.exposure_usd, 0) }
    }).filter((g) => g.rows.length > 0)
    return { flagged, clear, na, ticks, top, total, groups, label }
  }, [result])

  let row = 0

  return (
    <section className="xchart" aria-label="Exposure by rule">
      <header className="xchart__head">
        <div>
          <span className="eyebrow">Exposure by rule</span>
          <h2 className="xchart__title">Where the money is at risk</h2>
        </div>
        <div className="xchart__total">
          <span className="xchart__total-usd">{fmtUsd(data.total)}</span>
          <span className="xchart__total-meta">
            {data.flagged.length} flagged · {data.clear.length} clear
            {data.na.length > 0 && ` · ${data.na.length} n/a`}
          </span>
        </div>
      </header>

      {data.total > 0 && (
        <div className="xchart__share" role="img" aria-label="Share of exposure by severity">
          <div className="xchart__share-bar">
            {data.groups.map((g) => (
              <span
                key={g.sev}
                className={`xchart__share-seg xchart__share-seg--${g.sev.toLowerCase()}`}
                style={{ flexGrow: g.usd }}
                title={`${SEV_LABEL[g.sev]} · ${fmtUsd(g.usd)}`}
              />
            ))}
          </div>
          <div className="xchart__share-legend">
            {data.groups.map((g) => (
              <span key={g.sev} className={`xchart__share-item xchart__share-item--${g.sev.toLowerCase()}`}>
                <i aria-hidden />
                {SEV_LABEL[g.sev]}
                <b>{fmtUsd(g.usd)}</b>
                <em>{Math.round((g.usd / data.total) * 100)}%</em>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.flagged.length > 0 && (
        <div className="xchart__plot">
          <div className="xchart__axis" aria-hidden>
            <span />
            <div className="xchart__axis-scale">
              {data.ticks.map((t) => (
                <span key={t} style={{ left: `${(t / data.top) * 100}%` }}>
                  {shortUsd(t)}
                </span>
              ))}
            </div>
            <span />
          </div>

          {data.groups.map((g) => (
            <div key={g.sev} className={`xchart__group xchart__group--${g.sev.toLowerCase()}`}>
              <div className="xchart__group-head">
                <span className="xchart__group-pill">{SEV_LABEL[g.sev]}</span>
                <span className="xchart__group-rule" aria-hidden />
                <span className="xchart__group-usd mono">{fmtUsd(g.usd)}</span>
              </div>
              {g.rows.map((v) => {
                const i = row++
                const pct = Math.max(1.5, (v.exposure_usd / data.top) * 100)
                const style = { '--w': `${pct}%`, '--i': i } as CSSProperties
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`xrow${spoken === v.id ? ' xrow--spoken' : ''}`}
                    style={style}
                    onClick={() => openFinding(v.id)}
                    title={`${v.law} — open finding`}
                  >
                    <span className="xrow__label">
                      <span className="xrow__cat">{v.category}</span>
                      <span className="xrow__law">{v.law}</span>
                    </span>
                    <span
                      className="xrow__track"
                      style={{ '--ticks': data.ticks.length - 1 } as CSSProperties}
                    >
                      <span className="xrow__bar">
                        <span className="xrow__sheen" aria-hidden />
                      </span>
                    </span>
                    <span className="xrow__value">
                      <span className="xrow__usd">{fmtUsd(v.exposure_usd)}</span>
                      <span className="xrow__prob mono">{Math.round(v.probability * 100)}%</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {(data.clear.length > 0 || data.na.length > 0) && (
        <div className="xchart__chips">
          {data.clear.length > 0 && (
            <div className="xchart__chip-row">
              <span className="xchart__chip-title xchart__chip-title--ok">Clear</span>
              {data.clear.map((v) => (
                <span key={v.id} className="xchip xchip--ok" title={`${v.law} · ${Math.round(v.probability * 100)}%`}>
                  {data.label(v)}
                </span>
              ))}
            </div>
          )}
          {data.na.length > 0 && (
            <div className="xchart__chip-row">
              <span className="xchart__chip-title">Not applicable</span>
              {data.na.map((v) => (
                <span key={v.id} className="xchip xchip--na" title={v.evidence_quote}>
                  {data.label(v)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {children}
    </section>
  )
}
