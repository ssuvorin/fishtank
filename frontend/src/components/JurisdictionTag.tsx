import type { ReactNode } from 'react'
import type { Jurisdiction } from '../format'
import { JURISDICTION_LABEL, jurisdictionsOf } from '../format'

/** Jurisdiction chips derived from a violation's `law` string (UAE-first). */
export default function JurisdictionTags({ law }: { law: string }) {
  const js = jurisdictionsOf(law)
  if (js.length === 0) return null
  return (
    <span className="juris-tags">
      {js.map((j) => (
        <JurisdictionTag key={j} j={j} />
      ))}
    </span>
  )
}

export function JurisdictionTag({ j, children }: { j: Jurisdiction; children?: ReactNode }) {
  return (
    <span className={`juris juris--${j}`}>
      {j === 'eu' ? null : <span className="uae-bar uae-bar--v" aria-hidden />}
      {JURISDICTION_LABEL[j]}
      {children}
    </span>
  )
}
