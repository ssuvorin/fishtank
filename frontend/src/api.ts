// Typed client for POST /api/v1/audit — mirrors backend/app/models.py
// and specs/001-compliance-risk-audit/contracts/api-audit.md.

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM'

export interface AuditRequest {
  url: string
  annual_revenue?: number
}

export interface ViolationResult {
  id: string
  category: string
  law: string
  articles: string[]
  /** Calibrated Jev noul probability, 0..1 */
  probability: number
  /** probability >= 0.5 — flagged items render as violation cards */
  flagged: boolean
  exposure_usd: number
  exposure_aed: number
  severity: Severity
  /**
   * Penalty provenance label, passthrough from law.json penalty_framework.basis:
   * "estimate", statutory marker, or "mixed: ..." strings (Principle V).
   */
  basis: string
  /**
   * Verbatim substring of scraped text, or an explicit absence statement
   * ("The policy omits …") when the document is silent. Empty string allowed
   * for compliant items.
   */
  evidence_quote: string
  /** 'Cap: USD 28M' statutory ceiling label; '' when the regime publishes none. */
  statutory_label?: string

  remediation: string
  /**
   * False when the rule's regime has no nexus to the site (e.g. ADGM rules on
   * a non-ADGM site): never flagged, zero exposure. Absent on older backends.
   */
  applicable?: boolean
}

export interface Exposure {
  usd: number
  aed: number
}

export interface AuditResponse {
  url: string
  /** Final URLs of pages whose text entered the audit. */
  pages_scraped: string[]
  /** Effective annual revenue (USD) applied to turnover-scaled rules. */
  revenue_used: number
  /** True when the USD 5,000,000 default was applied. */
  revenue_assumed: boolean
  /** True when privacy page was unobtainable / text extraction partial. */
  limited_coverage: boolean
  exposure: Exposure
  /** All 14 rule results, ordered severity then probability desc. */
  violations: ViolationResult[]
  briefing_md: string
  warnings?: string[]
}

export type AuditErrorCode =
  | 'invalid_url'
  | 'scrape_unreachable'
  | 'scrape_http_error'
  | 'scrape_no_text'
  | 'scoring_unavailable'
  | 'timeout'

export class AuditApiError extends Error {
  constructor(
    message: string,
    public readonly code: AuditErrorCode | string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'AuditApiError'
  }
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export async function runAudit(req: AuditRequest): Promise<AuditResponse> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/v1/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch (err) {
    throw new AuditApiError(
      'Could not reach the audit service. Is the backend running on :8000?',
      'network_error',
      0,
    )
  }

  const body: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const env = (body ?? {}) as { detail?: unknown; code?: unknown }
    // detail may be a plain string (our contract) or FastAPI's default
    // [{loc, msg, type}] array for validation errors.
    const detail =
      typeof env.detail === 'string'
        ? env.detail
        : Array.isArray(env.detail)
          ? env.detail
              .map((d: { msg?: string }) => d?.msg ?? 'invalid request')
              .join('; ')
          : `Audit failed with HTTP ${res.status}.`
    const code = typeof env.code === 'string' ? env.code : `http_${res.status}`
    throw new AuditApiError(detail, code, res.status)
  }

  return body as AuditResponse
}

// --- Voiced briefing (ElevenLabs, proxied by the backend; key never in the SPA)

export interface NarrationWord {
  text: string
  start: number
  end: number
}

export interface NarrationResponse {
  script: string
  audio_base64: string
  mime: string
  words: NarrationWord[]
  /** Seconds at which the voice starts talking about each priority rule. */
  cues: { rule_id: string; start: number }[]
  voice: string
}

export async function voiceEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/briefing/voice`)
    if (!res.ok) return false
    const body = (await res.json()) as { enabled?: boolean }
    return body.enabled === true
  } catch {
    return false
  }
}

export async function requestNarration(result: AuditResponse): Promise<NarrationResponse> {
  const scored = result.violations.filter((v) => v.applicable !== false)
  const flagged = scored.filter((v) => v.flagged)
  const top = [...flagged]
    .sort((a, b) => b.exposure_usd - a.exposure_usd)
    .slice(0, 3)
    .map((v) => ({ rule_id: v.id, exposure_usd: v.exposure_usd }))
  let host = result.url
  try {
    host = new URL(result.url).hostname
  } catch {
    /* keep raw */
  }
  const res = await fetch(`${API_BASE}/api/v1/briefing/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host,
      exposure_usd: result.exposure.usd,
      exposure_aed: result.exposure.aed,
      flagged: flagged.length,
      total: scored.length,
      top,
    }),
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail
    throw new Error(typeof detail === 'string' ? detail : `Voice briefing failed (HTTP ${res.status}).`)
  }
  return body as NarrationResponse
}

export interface FixSession {
  session_id: string
  session_url: string
  repo?: string
  status?: string
  status_detail?: string | null
  pr_url?: string | null
  summary?: string | null
  todo_for_owner?: string[]
}

async function fixCall(path: string, init?: RequestInit): Promise<FixSession> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/v1/fix-pr${path}`, init)
  } catch {
    throw new AuditApiError('Could not reach the audit service.', 'network_error', 0)
  }
  const body = (await res.json().catch(() => null)) as
    | (FixSession & { detail?: string; code?: string })
    | null
  if (!res.ok || !body) {
    throw new AuditApiError(
      body?.detail ?? `Devin hand-off failed with HTTP ${res.status}.`,
      body?.code ?? `http_${res.status}`,
      res.status,
    )
  }
  return body
}

/** Start a Devin session that applies the remediation prompt and opens a PR. */
export function startFixPR(repo: string, prompt: string): Promise<FixSession> {
  return fixCall('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, prompt }),
  })
}

export function getFixPR(sessionId: string): Promise<FixSession> {
  return fixCall(`/${encodeURIComponent(sessionId)}`)
}
