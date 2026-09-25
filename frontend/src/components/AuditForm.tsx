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
    const trimmed = url.trim()
    if (!/^https?:\/\/.+\..+/i.test(trimmed)) {
      setLocalError('Enter a valid http(s) URL — e.g. https://example.ae')
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
    <form className="audit-form" onSubmit={handleSubmit}>
      <div className="audit-form__row">
        <input
          className="audit-form__url"
          type="text"
          inputMode="url"
          placeholder={PLACEHOLDER}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          aria-label="Website URL to audit"
        />
        <input
          className="audit-form__revenue"
          type="text"
          inputMode="numeric"
          placeholder="Annual revenue USD (optional)"
          title="Used for turnover-scaled penalty frameworks. Defaults to 5,000,000 USD."
          value={revenue}
          onChange={(e) => setRevenue(e.target.value)}
          disabled={busy}
          aria-label="Annual revenue in USD (optional)"
        />
        <button className="audit-form__submit" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-hidden /> : 'Audit'}
        </button>
      </div>
      <p className="audit-form__hint">
        Revenue defaults to <strong>USD 5,000,000</strong> for turnover-scaled
        penalty frameworks (GDPR 4%, ePrivacy) when left blank.
      </p>
      {localError && <p className="audit-form__error">{localError}</p>}
    </form>
  )
}
