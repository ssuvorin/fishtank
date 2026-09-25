import Markdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  Globe2,
  LoaderCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  runAudit,
  safeUrl,
  type AuditResponse,
  type ViolationResult,
} from "./api";
const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
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
export default function App() {
  const [url, setUrl] = useState("");
  const [revenue, setRevenue] = useState("");
  const [report, setReport] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (report) {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: "start" });
    }
  }, [report]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!safeUrl(url.trim())) {
      setError(
        "Enter a complete website URL, starting with https:// or http://.",
      );
      return;
    }
    const amount = Number(revenue);
    if (revenue && (!Number.isFinite(amount) || amount <= 0)) {
      setError(
        "Annual revenue must be a positive amount in USD, or leave it empty.",
      );
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setError("");
    setReport(null);
    setBusy(true);
    setElapsed(0);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 95000);
    try {
      setReport(
        await runAudit(
          { url: url.trim(), ...(revenue ? { annual_revenue: amount } : {}) },
          request.signal,
        ),
      );
    } catch (e) {
      setError(
        request.signal.aborted
          ? timedOut
            ? "The audit exceeded 95 seconds. Please try again."
            : "Audit cancelled. No risk estimate was produced."
          : e instanceof TypeError
            ? "Could not connect to the audit service. Check that the backend is running and try again."
            : e instanceof Error
              ? e.message
              : "Audit failed. Please try again.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      controller.current = null;
    }
  }
  function download() {
    if (!report) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { ...report, exported_at: new Date().toISOString() },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "complyrisk-audit.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  const findings = report
    ? [...report.violations].sort(
        (a, b) =>
          Number(b.flagged) - Number(a.flagged) ||
          rank[a.severity] - rank[b.severity] ||
          b.probability - a.probability,
      )
    : [];
  const flagged = findings.filter((f) => f.flagged);
  return (
    <div className="app">
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            <ShieldCheck size={23} />
          </span>
          complyrisk<span className="brand-ai">AI</span>
        </a>
        <span className="header-label">PUBLIC WEBSITE AUDITOR</span>
        <span className="region">
          <span /> UAE risk screening
        </span>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              Know your exposure. Know your next move.
            </div>
            <h1>
              Turn privacy gaps
              <br />
              into an <em>action plan.</em>
            </h1>
            <p>
              Audit your public website. See the evidence behind your financial
              risk — and what to fix first.
            </p>
          </div>
          <div className="intro-note">
            <ShieldCheck size={28} />
            <p>
              Evidence first.
              <br />
              Every finding, explained.
            </p>
            <small>10 checks · One clear report</small>
          </div>
        </section>
        <form className="audit-form" onSubmit={submit}>
          <div className="url-field">
            <label htmlFor="website">Website to audit</label>
            <div>
              <Globe2 size={19} />
              <input
                id="website"
                type="url"
                required
                placeholder="https://your-company.ae"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="revenue-field">
            <label htmlFor="revenue">
              Annual revenue <span>USD · optional</span>
            </label>
            <input
              id="revenue"
              type="number"
              min="0.01"
              step="any"
              placeholder="5,000,000 assumed"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              disabled={busy}
            />
          </div>
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Search size={18} />
            )}{" "}
            {busy ? "Auditing website" : "Run audit"}
            {!busy && <ArrowRight size={18} />}
          </button>
        </form>
        <div className="scope">
          <span>Public pages only · No login required</span>
          <span>
            Each finding lists its legal basis and financial assumptions.
          </span>
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {busy && (
          <section className="loading" role="status">
            <LoaderCircle className="spin" size={28} />
            <h2>Your audit is running</h2>
            <p>
              The service fetches public pages, evaluates rules and prepares
              recommendations.
            </p>
            <small>
              {elapsed}s elapsed · Usually completes within 90 seconds.
              Individual stage status is unavailable.
            </small>
            <button
              className="secondary"
              onClick={() => controller.current?.abort()}
            >
              Cancel audit
            </button>
          </section>
        )}
        {report ? (
          <section
            className="results"
            aria-label="Audit results"
            ref={resultsRef}
            tabIndex={-1}
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">Audit complete</span>
                <h2>{new URL(report.url).hostname}</h2>
              </div>
              <button className="secondary" onClick={download}>
                <Download size={16} />
                Export action plan
              </button>
            </div>
            {report.limited_coverage && (
              <div className="coverage" role="status">
                Limited coverage — the privacy page was unavailable or
                extraction was partial. Missing evidence does not establish a
                violation.
              </div>
            )}
            {report.warnings?.map((warning, index) => (
              <div className="coverage" key={index}>
                {warning}
              </div>
            ))}
            <div className="summary-grid">
              <div className="exposure">
                <span className="eyebrow">Modeled financial exposure</span>
                <div className="amount">
                  {money(report.exposure.usd)}
                  <span>USD</span>
                </div>
                <p>
                  {money(report.exposure.aed, "AED")}{" "}
                  <span>· fixed conversion, 3.673 AED/USD</span>
                </p>
                <small>
                  Scenario estimate for prioritization. Not a fine notice or a
                  prediction of enforcement. See each finding’s basis.
                </small>
              </div>
              <div className="metrics">
                <div>
                  <strong>{flagged.length.toString().padStart(2, "0")}</strong>
                  <span>Flagged findings</span>
                </div>
                <div>
                  <strong>{findings.length}</strong>
                  <span>Rules evaluated</span>
                </div>
                <div>
                  <strong>
                    {report.pages_scraped.length.toString().padStart(2, "0")}
                  </strong>
                  <span>Pages reviewed</span>
                </div>
                <p>
                  Annual revenue: <b>{money(report.revenue_used)}</b>{" "}
                  {report.revenue_assumed ? "(assumed)" : "(provided)"}
                </p>
              </div>
            </div>
            <div className="section-heading">
              <h2>
                Findings & recommendations{" "}
                <span className="count">{flagged.length}</span>
              </h2>
              <span className="muted">
                Open a finding to inspect the evidence
              </span>
            </div>
            {flagged.length === 0 && (
              <p className="coverage">
                <Check size={16} /> No rules were flagged in the reviewed
                material. This does not confirm legal compliance.
              </p>
            )}
            <div>
              {findings.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
            <details className="briefing">
              <summary>Executive briefing</summary>
              {report.briefing_md ? (
                <div className="briefing-text">
                  <Markdown skipHtml>{report.briefing_md}</Markdown>
                </div>
              ) : (
                <p>
                  The narrative was unavailable. Findings and recommendations
                  remain available above.
                </p>
              )}
            </details>
            <div className="sources">
              <span className="eyebrow">Pages included in this audit</span>
              {report.pages_scraped.map((p) =>
                safeUrl(p) ? (
                  <a key={p} href={safeUrl(p)} target="_blank" rel="noreferrer">
                    {p}
                    <ArrowUpRight size={14} />
                  </a>
                ) : (
                  <span key={p}>{p}</span>
                ),
              )}
            </div>
          </section>
        ) : (
          !busy && (
            <section className="empty">
              <div className="empty-icon">
                <ShieldCheck size={34} />
              </div>
              <h2>Your next decision starts with evidence.</h2>
              <p>Enter a website above to create your audit report.</p>
              <div className="steps">
                {[
                  [
                    "01",
                    "Inspect public pages",
                    "Review the available website and privacy text.",
                  ],
                  [
                    "02",
                    "Understand your exposure",
                    "See flagged rules, assumptions and monetary risk.",
                  ],
                  [
                    "03",
                    "Take focused action",
                    "Get evidence and practical remediation guidance.",
                  ],
                ].map(([n, title, copy]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                ))}
              </div>
            </section>
          )
        )}
        <footer>
          <span>COMPLYRISK AI</span>
          <p>
            Public-site screening supports an auditor’s review. Applicability
            and internal practices require confirmation.
          </p>
          <span>Evidence → Exposure → Action</span>
        </footer>
      </main>
    </div>
  );
}
