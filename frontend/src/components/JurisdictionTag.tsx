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

const JURIS_LOGO: Partial<Record<Jurisdiction, string>> = {
  difc: '/logos/freezones/difc-white.png',
  adgm: '/logos/freezones/adgm-white.svg',
}

export function JurisdictionTag({ j, children }: { j: Jurisdiction; children?: ReactNode }) {
  const logo = JURIS_LOGO[j]
  return (
    <span className={`juris juris--${j}`}>
      {logo ? (
        <img className="juris__logo" src={logo} alt="" aria-hidden />
      ) : j === 'eu' ? null : (
        <span className="uae-bar uae-bar--v" aria-hidden />
      )}
      {JURISDICTION_LABEL[j]}
      {children}
    </span>
  )
}
