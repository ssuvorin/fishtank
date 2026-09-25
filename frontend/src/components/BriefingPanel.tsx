import ReactMarkdown from 'react-markdown'

/**
 * Renders the executive briefing narrative (briefing_md) produced by the
 * backend synthesis stage. Grounded in the audit's own rule results — the
 * model is constrained to supplied violations/citations/figures.
 */
export default function BriefingPanel({ briefing_md }: { briefing_md: string }) {
  if (!briefing_md.trim()) {
    return (
      <section className="briefing briefing--empty">
        <h3 className="briefing__title">Executive Briefing</h3>
        <p className="briefing__note">
          Briefing narrative unavailable for this audit — the violation grid
          and exposure figures above remain fully computed.
        </p>
      </section>
    )
  }
  return (
    <section className="briefing">
      <h3 className="briefing__title">Executive Briefing</h3>
      <div className="briefing__body">
        <ReactMarkdown>{briefing_md}</ReactMarkdown>
      </div>
    </section>
  )
}
