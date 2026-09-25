const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const aedFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function fmtUsd(n: number): string {
  return usdFmt.format(n)
}

export function fmtAed(n: number): string {
  return `${aedFmt.format(n)} AED`
}

/**
 * Classify a law.json `basis` passthrough string into a badge kind.
 * "estimate" → estimate; "mixed: …" → mixed; anything else → statutory.
 * Used by every surface that renders a provenance badge (Principle V).
 */
export type BasisKind = 'estimate' | 'statutory' | 'mixed'

export function basisKind(basis: string): BasisKind {
  const b = basis.trim().toLowerCase()
  if (b.startsWith('mixed')) return 'mixed'
  if (b.includes('estimate')) return 'estimate'
  return 'statutory'
}

export function basisLabel(basis: string): string {
  const kind = basisKind(basis)
  if (kind === 'estimate') return 'Estimated'
  if (kind === 'mixed') return 'Mixed basis'
  return 'Statutory'
}

/**
 * True when `evidence_quote` is an explicit absence statement ("The policy
 * omits …") rather than a verbatim substring of the scraped page.
 */
export function isAbsenceStatement(quote: string): boolean {
  const q = quote.trim().toLowerCase()
  return (
    q.startsWith('the policy omits') ||
    (q.startsWith('no ') && q.includes('found')) ||
    q.includes('omits ') ||
    q.includes('not found')
  )
}

export type Jurisdiction = 'uae' | 'difc' | 'eu'

export const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  uae: 'UAE PDPL',
  difc: 'DIFC',
  eu: 'EU',
}

/**
 * Jurisdictions cited by a violation's `law` string (the response carries no
 * separate jurisdiction field). Order is UAE-first, matching law.json.
 */
export function jurisdictionsOf(law: string): Jurisdiction[] {
  const l = law.toLowerCase()
  const out: Jurisdiction[] = []
  if (/\buae\b|pdpl|45\/2021/.test(l)) out.push('uae')
  if (l.includes('difc')) out.push('difc')
  if (/gdpr|general data protection regulation|eprivacy|2002\/58|edpb/.test(l)) out.push('eu')
  return out
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
