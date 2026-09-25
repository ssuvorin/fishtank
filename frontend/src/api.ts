// Typed client for POST /api/v1/audit — mirrors backend/app/models.py
// and specs/001-compliance-risk-audit/contracts/api-audit.md.

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface AuditRequest {
  url: string;
  annual_revenue?: number;
}

export interface ViolationResult {
  id: string;
  category: string;
  law: string;
  articles: string[];
  /** Calibrated Jev noul probability, 0..1 */
  probability: number;
  /** probability >= 0.5 — flagged items render as violation cards */
  flagged: boolean;
  exposure_usd: number;
  exposure_aed: number;
  severity: Severity;
  /**
   * Penalty provenance label, passthrough from law.json penalty_framework.basis:
   * "estimate", statutory marker, or "mixed: ..." strings (Principle V).
   */
  basis: string;
  /**
   * Verbatim substring of scraped text, or an explicit absence statement
   * ("The policy omits …") when the document is silent. Empty string allowed
   * for not-flagged items.
   */
  evidence_quote: string;
  source_url?: string;
  legal_source_url?: string;
  evidence_kind?: "quote" | "absence";
  remediation: string;
}

export interface Exposure {
  usd: number;
  aed: number;
}

export interface AuditResponse {
  url: string;
  /** Final URLs of pages whose text entered the audit. */
  pages_scraped: string[];
  /** Effective annual revenue (USD) applied to turnover-scaled rules. */
  revenue_used: number;
  /** True when the USD 5,000,000 default was applied. */
  revenue_assumed: boolean;
  /** True when privacy page was unobtainable / text extraction partial. */
  limited_coverage: boolean;
  exposure: Exposure;
  /** All 10 rule results, ordered severity then probability desc. */
  violations: ViolationResult[];
  briefing_md: string;
  warnings?: string[];
}

export type AuditErrorCode =
  | "invalid_url"
  | "scrape_unreachable"
  | "scrape_http_error"
  | "scrape_no_text"
  | "scoring_unavailable"
  | "timeout";

export class AuditApiError extends Error {
  constructor(
    message: string,
    public readonly code: AuditErrorCode | string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuditApiError";
  }
}

export function safeUrl(value?: string) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? ""
).replace(/\/$/, "");

export async function runAudit(
  req: AuditRequest,
  signal?: AbortSignal,
): Promise<AuditResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new AuditApiError(
      "Could not reach the audit service. Is the backend running on :8000?",
      "network_error",
      0,
    );
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const env = (body ?? {}) as { detail?: unknown; code?: unknown };
    // detail may be a plain string (our contract) or FastAPI's default
    // [{loc, msg, type}] array for validation errors.
    const detail =
      typeof env.detail === "string"
        ? env.detail
        : Array.isArray(env.detail)
          ? env.detail
              .map((d: { msg?: string }) => d?.msg ?? "invalid request")
              .join("; ")
          : `Audit failed with HTTP ${res.status}.`;
    const code = typeof env.code === "string" ? env.code : `http_${res.status}`;
    throw new AuditApiError(detail, code, res.status);
  }

  if (
    !body ||
    (body.warnings !== undefined &&
      (!Array.isArray(body.warnings) ||
        !body.warnings.every((w: unknown) => typeof w === "string"))) ||
    typeof body.url !== "string" ||
    !safeUrl(body.url) ||
    !Array.isArray(body.pages_scraped) ||
    !body.pages_scraped.every((p: unknown) => typeof p === "string") ||
    typeof body.revenue_assumed !== "boolean" ||
    typeof body.limited_coverage !== "boolean" ||
    !Number.isFinite(body.revenue_used) ||
    !Number.isFinite(body.exposure?.usd) ||
    !Number.isFinite(body.exposure?.aed) ||
    body.exposure.usd < 0 ||
    body.exposure.aed < 0 ||
    typeof body.briefing_md !== "string" ||
    !Array.isArray(body.violations) ||
    body.violations.length !== 10 ||
    new Set(body.violations.map((v: ViolationResult) => v?.id)).size !== 10 ||
    !body.violations.every(
      (v: ViolationResult) =>
        v &&
        ["id", "category", "law", "basis", "remediation"].every(
          (k) => typeof v[k as keyof ViolationResult] === "string",
        ) &&
        Array.isArray(v.articles) &&
        v.articles.every((a) => typeof a === "string") &&
        typeof v.flagged === "boolean" &&
        ["CRITICAL", "HIGH", "MEDIUM"].includes(v.severity) &&
        Number.isFinite(v.probability) &&
        v.probability >= 0 &&
        v.probability <= 1 &&
        Number.isFinite(v.exposure_usd) &&
        v.exposure_usd >= 0 &&
        Number.isFinite(v.exposure_aed) &&
        v.exposure_aed >= 0 &&
        typeof v.evidence_quote === "string" &&
        (!v.flagged || v.evidence_quote.trim().length > 0) &&
        ["source_url", "legal_source_url"].every(
          (k) =>
            v[k as keyof ViolationResult] === undefined ||
            typeof v[k as keyof ViolationResult] === "string",
        ),
    )
  )
    throw new AuditApiError(
      "The audit service returned an incomplete report. No risk estimate is displayed.",
      "invalid_response",
      res.status,
    );

  return body as AuditResponse;
}
