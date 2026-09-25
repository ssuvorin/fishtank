import { useEffect, useRef, useState } from 'react'
import type { AuditResponse, ViolationResult } from '../api'
import { copyText } from '../clipboard'
import {
  JURISDICTION_LABEL,
  fmtAed,
  fmtUsd,
  hostOf,
  isAbsenceStatement,
  jurisdictionsOf,
} from '../format'

/**
 * "Fix with your AI agent" — builds a markdown prompt the site owner pastes
 * into their own coding agent (Devin / Claude / Copilot). Every fact in the
 * prompt is interpolated from the audit response; the only authored text is
 * the role line, the deliverable wording, and generic acceptance criteria.
 */

const role = (what: string) =>
  `You are a senior web engineer and privacy engineer. Implement ${what} below on the website I own. Work from my codebase; ask before deleting anything.`

/** Concrete artifact the agent should produce, keyed by law.json rule id. */
const DELIVERABLE: Record<string, string> = {
  uae_pdpl_lawful_consent:
    'A consent-capture change: consent checkbox / banner copy with a link to the policy, plus a privacy-policy clause stating the lawful basis for each processing purpose.',
  uae_dpo_appointment:
    'A "Data Protection Officer" contact block (HTML/JSX markup) for the privacy policy and footer, with placeholders I fill in for name, email and postal address.',
  cross_border_data_transfers:
    'A "International data transfers" section for the privacy policy listing destination countries/recipients and the safeguard relied on for each.',
  uae_breach_notification:
    'A "Personal data breach" section for the privacy policy describing how breaches are detected, assessed and notified to the regulator and affected users.',
  uae_data_subject_rights:
    'A data-subject rights request page (route + form component) covering access, correction, erasure, restriction, objection and portability, plus the matching policy clause.',
  uae_sensitive_data_consent:
    'A sensitive-data handling change: separate explicit-consent control for sensitive categories, plus a policy clause naming those categories.',
  automated_profiling_transparency:
    'A privacy-policy section on automated decision-making and profiling: logic involved, consequences for the user, and how to request human review.',
  cookie_reject_dark_patterns:
    'A cookie consent banner component with "Reject all" given equal prominence to "Accept all", granular categories, and no non-essential cookies set before consent.',
  gdpr_explicit_consent:
    'A consent-capture change for EU visitors: unticked, granular opt-in controls with a record of consent, plus the matching policy clause.',
  gdpr_child_data:
    "A children's-data change: age gate or parental-consent flow where required, plus a policy clause on minimum age.",
}

const FALLBACK_DELIVERABLE =
  'The concrete code and/or policy-text change that implements the remediation above.'

function citation(v: ViolationResult): string {
  const juris = jurisdictionsOf(v.law).map((j) => JURISDICTION_LABEL[j])
  const parts = [`**Law:** ${v.law}`]
  if (juris.length) parts.push(`**Jurisdiction:** ${juris.join(' · ')}`)
  if (v.articles.length) parts.push(`**Articles cited:** ${v.articles.join(', ')}`)
  return parts.map((p) => `- ${p}`).join('\n')
}

function evidenceBlock(v: ViolationResult): string {
  const q = v.evidence_quote.trim()
  if (!q) return '_No evidence quote was captured for this finding._'
  if (isAbsenceStatement(q)) return `**Gap identified (nothing to quote):** ${q}`
  return `Verbatim from the site:\n\n> ${q.replace(/\n+/g, '\n> ')}`
}

/** One finding as a self-contained markdown section. */
function findingSection(v: ViolationResult, url: string, heading: string): string {
  return [
    `${heading} ${v.category}`,
    '',
    `- **Site:** ${url}`,
    citation(v),
    `- **Severity:** ${v.severity} · violation probability ${Math.round(v.probability * 100)}%`,
    `- **Modeled exposure:** ${fmtUsd(v.exposure_usd)} (${fmtAed(v.exposure_aed)}) — basis: ${v.basis}`,
    '',
    '**Evidence**',
    '',
    evidenceBlock(v),
    '',
    '**Required remediation**',
    '',
    v.remediation,
    '',
    '**Deliverable**',
    '',
    DELIVERABLE[v.id] ?? FALLBACK_DELIVERABLE,
    '',
    '**Acceptance criteria**',
    '',
    `- [ ] The change directly implements the remediation above for ${hostOf(url)}.`,
    '- [ ] Policy wording cites the law and articles listed above — no invented article numbers.',
    '- [ ] Visible on the live site where a visitor would expect it (policy page, footer, or banner).',
    '- [ ] Works without JavaScript errors on desktop and mobile; keyboard and screen-reader accessible.',
    '- [ ] Any placeholder (names, emails, addresses, countries) is clearly marked `TODO` for me to fill.',
  ].join('\n')
}

const OUTPUT_INSTRUCTIONS = [
  '## Output format',
  '',
  '1. A short plan (max 5 bullets).',
  '2. Each change as a unified diff or a complete file, with its path in my repo.',
  '3. Any policy text as ready-to-paste markdown, marked with where it goes.',
  '4. A list of facts you need from me that you could not infer from the code.',
  '',
  '_Source: ComplyRisk AI audit — a screening signal, not legal advice. Have counsel review final policy wording._',
].join('\n')

export function violationPrompt(v: ViolationResult, url: string): string {
  return [
    `# Compliance fix: ${v.category}`,
    '',
    role('the compliance fix'),
    '',
    findingSection(v, url, '## Finding —'),
    '',
    OUTPUT_INSTRUCTIONS,
  ].join('\n')
}

export function reportPrompt(r: AuditResponse, generatedAt: Date): string {
  const flagged = r.violations.filter((v) => v.flagged)
  const header = [
    `# Compliance remediation plan — ${hostOf(r.url)}`,
    '',
    role('every compliance fix'),
    '',
    '## Audit summary',
    '',
    `- **Site:** ${r.url}`,
    `- **Total modeled exposure:** ${fmtUsd(r.exposure.usd)} (${fmtAed(r.exposure.aed)})`,
    `- **Revenue basis:** ${fmtUsd(r.revenue_used)}${r.revenue_assumed ? ' (assumed default)' : ' (declared)'}`,
    `- **Findings flagged:** ${flagged.length} of ${r.violations.length} rules`,
    `- **Pages scanned (${r.pages_scraped.length}):** ${r.pages_scraped.join(', ') || '—'}`,
    ...(r.limited_coverage
      ? ['- **Coverage:** limited — privacy policy page could not be fetched']
      : []),
    `- **Generated:** ${generatedAt.toISOString()}`,
    '',
    'Fix the findings in the order listed (highest exposure first).',
  ]

  const ordered = flagged.slice().sort((a, b) => b.exposure_usd - a.exposure_usd)
  const sections = ordered.map((v, i) => findingSection(v, r.url, `## ${i + 1}.`))

  const global = [
    '## Global acceptance checklist',
    '',
    ...ordered.map((v, i) => `- [ ] ${i + 1}. ${v.category} — remediated and live`),
    '- [ ] Privacy policy has a "last updated" date reflecting these changes.',
    '- [ ] No finding was "fixed" by removing disclosures that were already accurate.',
    '- [ ] All placeholders are listed back to me for completion.',
  ].join('\n')

  return [header.join('\n'), ...sections, global, OUTPUT_INSTRUCTIONS].join('\n\n---\n\n')
}

function AgentIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

function FixPromptDialog({
  title,
  subtitle,
  build,
  onClose,
}: {
  title: string
  subtitle: string
  build: () => string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [text] = useState(build)
  const [copy, setCopy] = useState<CopyState>('idle')

  useEffect(() => {
    // No close() on cleanup: StrictMode's remount would queue a stray
    // `close` event that unmounts the freshly re-opened dialog.
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  useEffect(() => {
    if (copy === 'idle') return
    const t = setTimeout(() => setCopy('idle'), 2200)
    return () => clearTimeout(t)
  }, [copy])

  async function handleCopy() {
    setCopy((await copyText(text)) ? 'copied' : 'failed')
  }

  return (
    <dialog
      ref={ref}
      className="fix-dialog"
      aria-labelledby="fix-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="fix-dialog__panel">
        <header className="fix-dialog__head">
          <div>
            <span className="eyebrow fix-dialog__eyebrow">
              <AgentIcon /> Fix with your AI agent
            </span>
            <h2 id="fix-dialog-title" className="fix-dialog__title">
              {title}
            </h2>
            <p className="fix-dialog__sub">{subtitle}</p>
          </div>
          <button
            type="button"
            className="fix-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <pre className="fix-dialog__preview" tabIndex={0}>
          {text}
        </pre>
        <footer className="fix-dialog__foot">
          <span className="fix-dialog__hint">
            Paste into Devin, Claude Code, Copilot or Cursor ·{' '}
            <span className="mono">{text.length.toLocaleString('en-US')} chars</span>
          </span>
          <button
            type="button"
            className={`btn btn--primary fix-dialog__copy fix-dialog__copy--${copy}`}
            onClick={handleCopy}
            autoFocus
          >
            {copy === 'copied'
              ? '✓ Copied to clipboard'
              : copy === 'failed'
                ? 'Copy failed — select text manually'
                : 'Copy markdown prompt'}
          </button>
        </footer>
      </div>
    </dialog>
  )
}

/** Per-card trigger: ghost button + modal for one flagged violation. */
export function FixViolationButton({ v, url }: { v: ViolationResult; url: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn btn--ghost fix-btn"
        onClick={() => setOpen(true)}
      >
        <AgentIcon /> Fix with AI agent
      </button>
      {open && (
        <FixPromptDialog
          title={v.category}
          subtitle={`${v.law} · ${fmtUsd(v.exposure_usd)} modeled exposure`}
          build={() => violationPrompt(v, url)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** Report-level CTA: one markdown plan covering every flagged finding. */
export function FixReportButton({ result }: { result: AuditResponse }) {
  const [open, setOpen] = useState(false)
  const n = result.violations.filter((v) => v.flagged).length
  if (n === 0) return null
  return (
    <>
      <button
        type="button"
        className="btn btn--primary fix-report-btn"
        onClick={() => setOpen(true)}
      >
        <AgentIcon /> Fix all {n} flagged with AI agent
      </button>
      {open && (
        <FixPromptDialog
          title={`Remediation plan — ${hostOf(result.url)}`}
          subtitle={`${n} flagged finding${n === 1 ? '' : 's'} · ${fmtUsd(result.exposure.usd)} total modeled exposure`}
          build={() => reportPrompt(result, new Date())}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
