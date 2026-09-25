import ReactMarkdown from 'react-markdown'

/**
 * Renders the executive briefing narrative (briefing_md) produced by the
 * backend synthesis stage. Grounded in the audit's own rule results — the
 * model is constrained to supplied violations/citations/figures.
 */
export default function BriefingPanel({ briefing_md }: { briefing_md: string }) {
  const empty = !briefing_md.trim()
  return (
    <section className={`briefing${empty ? ' briefing--empty' : ''}`}>
      <header className="briefing__head">
        <div>
          <span className="eyebrow">For the board</span>
          <h2 className="briefing__title">Executive Briefing</h2>
        </div>
        <span className="briefing__tag">Grounded in audit results</span>
      </header>
      {empty ? (
        <p className="briefing__note">
          Briefing narrative unavailable for this audit — the violation grid
          and exposure figures above remain fully computed.
        </p>
      ) : (
        <div className="briefing__body prose">
          <ReactMarkdown>{briefing_md}</ReactMarkdown>
        </div>
      )}
    </section>
  )
}
