import type { AuditResponse } from '../api'

/**
 * Export the Executive Action Plan: serializes the already-parsed audit
 * response (guaranteed valid JSON) plus export metadata into a .json
 * download. Fully client-side — works offline once an audit exists
 * (constitution demo safety). No server round-trip.
 */
export default function ExportButton({ result }: { result: AuditResponse }) {
  function handleExport() {
    const plan = {
      url: result.url,
      exported_at: new Date().toISOString(),
      revenue_used: result.revenue_used,
      revenue_assumed: result.revenue_assumed,
      exposure: result.exposure,
      violations: result.violations,
      remediation_prioritized: result.violations
        .filter((v) => v.flagged)
        .slice()
        .sort((a, b) => b.exposure_usd - a.exposure_usd)
        .map((v, i) => ({
          priority: i + 1,
          rule_id: v.id,
          action: v.remediation,
          exposure_reduced_usd: v.exposure_usd,
        })),
      briefing_md: result.briefing_md,
      disclaimer:
        'Screening signal for prioritization — not legal advice. AED at fixed 3.673 peg.',
    }
    const host = (() => {
      try {
        return new URL(result.url).hostname.replace(/[^a-z0-9.-]+/gi, '-')
      } catch {
        return 'site'
      }
    })()
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `complyrisk-action-plan-${host}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <button
      type="button"
      className="btn btn--ghost export-btn"
      onClick={handleExport}
      title="Download the full audit as an Executive Action Plan JSON"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
        <path
          d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M3 13h10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Export Action Plan
    </button>
  )
}
