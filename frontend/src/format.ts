const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const aedFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

export function fmtUsd(n: number): string {
  return usdFmt.format(n)
}

export function fmtAed(n: number): string {
  return `${aedFmt.format(n)} AED`
}

/**
 * Classify a law.json `basis` passthrough string into a badge kind.
 * "estimate" → estimate; statutory marker → statutory; "mixed: …" → mixed.
 */
export type BasisKind = 'estimate' | 'statutory' | 'mixed'

export function basisKind(basis: string): BasisKind {
  const b = basis.trim().toLowerCase()
  if (b.startsWith('mixed')) return 'mixed'
  if (b === 'estimate' || b.includes('estimate')) return 'estimate'
  return 'statutory'
}

export function basisLabel(basis: string): string {
  const kind = basisKind(basis)
  if (kind === 'estimate') return 'Estimated'
  if (kind === 'mixed') return 'Mixed basis'
  return 'Statutory'
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`
}
