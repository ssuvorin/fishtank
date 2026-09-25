import { ArrowUpRight } from "lucide-react";
import { safeUrl, type ViolationResult } from "../api";
import { formatMoney as money } from "../format";
function FindingCard({ finding: f }: { finding: ViolationResult }) {
  const source = safeUrl(f.source_url);
  const law = safeUrl(f.legal_source_url);
  return (
    <details className="finding">
      <summary>
        <span
          className={`severity ${f.flagged ? f.severity.toLowerCase() : "clear"}`}
        >
          {f.flagged ? f.severity : "NOT FLAGGED"}
        </span>
        <span className="finding-title">
          {f.category}
          <small>{f.articles.join(" · ")}</small>
        </span>
        <strong>{money(f.exposure_usd)}</strong>
        <span className="expand">+</span>
      </summary>
      <div className="finding-body">
        <div>
          <span className="eyebrow">Evidence & observation</span>
          <p className="evidence">
            {f.evidence_quote || "No supporting excerpt was returned."}
          </p>
          <small>
            {f.evidence_kind === "quote"
              ? "Source excerpt"
              : f.evidence_kind === "absence"
                ? "Absence in the reviewed material"
                : "The API has not distinguished an excerpt from an absence statement."}
          </small>
          {source ? (
            <a href={source} target="_blank" rel="noreferrer">
              Open evidence source <ArrowUpRight size={14} />
            </a>
          ) : (
            <small>Per-finding source URL unavailable.</small>
          )}
        </div>
        <div>
          <span className="eyebrow">Auditor recommendation</span>
          <p>{f.remediation}</p>
          <div className="basis">
            Basis: {f.basis} · {money(f.exposure_aed, "AED")}
          </div>
          <small>
            Model assessment: {Math.round(f.probability * 100)}% · This is not
            the probability of receiving a fine.
          </small>
          {law && (
            <a href={law} target="_blank" rel="noreferrer">
              Legal source <ArrowUpRight size={14} />
            </a>
          )}
          <small>{f.law}</small>
        </div>
      </div>
    </details>
  );
}

export default function ViolationGrid({
  findings,
}: {
  findings: ViolationResult[];
}) {
  return (
    <div className="findings-ledger">
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
    </div>
  );
}
