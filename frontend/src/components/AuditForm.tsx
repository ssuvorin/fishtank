import { useState } from 'react'
import type { FormEvent } from 'react'

interface Props {
  onSubmit: (url: string, annualRevenue?: number) => void
  busy: boolean
}

const PLACEHOLDER = 'https://your-site.ae'

export default function AuditForm({ onSubmit, busy }: Props) {
  const [url, setUrl] = useState('')
  const [revenue, setRevenue] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    let trimmed = url.trim()
    // "careem.com" / "www.sarwa.co" → https://… (other schemes still rejected)
    if (!/^[a-z][a-z\d+.-]*:/i.test(trimmed) && /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(trimmed)) {
      trimmed = `https://${trimmed}`
      setUrl(trimmed)
    }
    if (!/^https?:\/\/.+\..+/i.test(trimmed)) {
      setLocalError('Enter a website address — e.g. example.ae or https://example.ae')
      return
    }
    setLocalError(null)

    const raw = revenue.trim()
    let parsed: number | undefined
    if (raw !== '') {
      const n = Number(raw.replace(/[,_\s]/g, ''))
      if (!Number.isFinite(n) || n <= 0) {
        setLocalError('Annual revenue must be a positive number (USD).')
        return
      }
      parsed = n
    }
    onSubmit(trimmed, parsed)
  }

  return (
    <form
      className={`audit-form${busy ? ' audit-form--busy' : ''}`}
      onSubmit={handleSubmit}
    >
      <div className="audit-form__row">
        <label className="field field--url">
          <span className="field__label">Website</span>
          <input
            className="field__input audit-form__url"
            type="text"
            inputMode="url"
            placeholder={PLACEHOLDER}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            aria-label="Website URL to audit"
            autoComplete="url"
            spellCheck={false}
          />
        </label>
        <label className="field field--revenue">
          <span className="field__label">Annual revenue · USD</span>
          <input
            className="field__input audit-form__revenue"
            type="text"
            inputMode="numeric"
            placeholder="5,000,000 (default)"
            title="Used for turnover-scaled penalty frameworks. Defaults to 5,000,000 USD."
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            disabled={busy}
            aria-label="Annual revenue in USD (optional)"
          />
        </label>
        <button className="btn btn--primary audit-form__submit" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden /> Auditing
            </>
          ) : (
            <>
              Run audit <span aria-hidden>→</span>
            </>
          )}
        </button>
      </div>
      {localError ? (
        <p className="audit-form__error" role="alert">
          {localError}
        </p>
      ) : (
        <p className="audit-form__hint">
          Revenue defaults to <strong>USD 5,000,000</strong> for turnover-scaled
          penalty frameworks (GDPR 4%, ePrivacy) when left blank.
        </p>
      )}
    </form>
  )
}
