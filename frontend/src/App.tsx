import ViolationGrid from "./components/ViolationGrid";
import { formatMoney as money } from "./format";
import ScanInstrument from "./components/ScanInstrument";
import Markdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Globe2,
  LoaderCircle,
  X,
} from "lucide-react";
import { runAudit, safeUrl, type AuditResponse } from "./api";
const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
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
      <header className="masthead">
        <a className="brand" href="/" aria-label="ComplyRisk home">
          <span className="brand-mark">
            c<span>/</span>
          </span>
          <span>
            complyrisk<small>THE PRIVACY AUDIT WORKSPACE</small>
          </span>
        </a>
        <div className="masthead-meta">
          <span className="edition">UAE EDITION</span>
          <span>Federal PDPL · Public-site screening</span>
        </div>
        <a className="header-link" href="#audit-form">
          Start a review <ArrowUpRight size={16} />
        </a>
      </header>
      <div className="workspace">
        <aside className="index-rail" aria-label="Report sections">
          <span className="rail-label">WORKSPACE / 01</span>
          <a
            href="#audit-form"
            className={!report ? "rail-item current" : "rail-item"}
          >
            <span>01</span>Website
          </a>
          <a
            href="#audit-results"
            className={report ? "rail-item current" : "rail-item"}
            aria-disabled={!report}
            onClick={(e) => !report && e.preventDefault()}
          >
            <span>02</span>Risk review
          </a>
          <a
            href="#findings"
            className="rail-item"
            aria-disabled={!report}
            onClick={(e) => !report && e.preventDefault()}
          >
            <span>03</span>Findings
          </a>
          <div className="rail-bottom">
            <span className="rail-cross">+</span>
            <p>
              Public website review
              <br />
              10 configured rules.
              <br />
              Federal PDPL foundation.
            </p>
            <span>UAE / EN</span>
          </div>
        </aside>
        <main>
          <section className={`intro ${report ? "intro-compact" : ""}`}>
            <div className="intro-copy">
              <div className="eyebrow">
                <span className="orange-line" /> PRIVACY EXPOSURE REVIEW
              </div>
              <h1>
                Review your
                <br /> <em>privacy risks.</em>
              </h1>
              <p>
                Find the gaps in your public privacy disclosures.
                <br />
                Put a financial estimate beside each one.
              </p>
              <div className="intro-details">
                <span>10 legal checks</span>
                <span>Evidence attached</span>
                <span>Prioritized fixes</span>
              </div>
            </div>
            {!report && (
              <div className="intro-instrument">
                <ScanInstrument active={busy} />
                <p className="instrument-caption">
                  <span>01 / OBSERVE</span>Public pages. Traceable findings.
                </p>
              </div>
            )}
          </section>
          <form className="audit-form" id="audit-form" onSubmit={submit}>
            <div className="form-caption">
              <span className="section-number">01</span>
              <h2>Begin with a website</h2>
              <span>NO LOGIN REQUIRED</span>
            </div>
            <div className="form-fields">
              <div className="url-field">
                <label htmlFor="website">Website to audit</label>
                <div>
                  <Globe2 size={18} />
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
                  <>
                    <LoaderCircle className="spin" size={17} /> Reviewing
                  </>
                ) : (
                  <>
                    Run audit <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
            <div className="form-note">
              <span>Landing page + privacy policy, where available.</span>
              <span>Revenue is used for turnover-based estimates.</span>
            </div>
          </form>
          {error && (
            <div role="alert" className="error">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
          {busy && (
            <section className="loading" role="status">
              <div>
                <span className="eyebrow">REVIEW IN PROGRESS</span>
                <h2>Reading the fine print.</h2>
                <p>
                  Collecting public text, checking the rules and preparing your
                  report.
                </p>
                <small>
                  Stage-level updates are unavailable. Most reviews finish
                  within 90 seconds.
                </small>
              </div>
              <div className="elapsed">
                <strong>
                  {elapsed.toString().padStart(2, "0")}
                  <span>s</span>
                </strong>
                <button
                  className="text-button"
                  onClick={() => controller.current?.abort()}
                >
                  Cancel audit <X size={12} />
                </button>
              </div>
            </section>
          )}
          {report ? (
            <section
              className="results"
              id="audit-results"
              aria-label="Audit results"
              ref={resultsRef}
              tabIndex={-1}
            >
              <div className="section-heading">
                <div className="report-title">
                  <span className="section-number">02</span>
                  <div>
                    <span className="eyebrow">COMPLETED REVIEW</span>
                    <h2>{new URL(report.url).hostname}</h2>
                  </div>
                </div>
                <button className="secondary" onClick={download}>
                  <Download size={15} />
                  Export action plan
                </button>
              </div>
              {report.limited_coverage && (
                <div className="coverage" role="status">
                  <span className="notice-mark">!</span>
                  <span>
                    Limited coverage — the privacy page was unavailable or
                    extraction was partial. Missing evidence does not establish
                    a violation.
                  </span>
                </div>
              )}
              {report.warnings?.map((warning, index) => (
                <div className="coverage" key={index}>
                  {warning}
                </div>
              ))}
              <div className="summary-grid">
                <div className="exposure">
                  <span className="eyebrow">MODELED FINANCIAL EXPOSURE</span>
                  <div className="amount">
                    {money(report.exposure.usd)}
                    <span>USD</span>
                  </div>
                  <p className="aed-amount">
                    {money(report.exposure.aed, "AED")}{" "}
                    <span>at 3.673 AED/USD</span>
                  </p>
                  <div className="exposure-note">
                    <span>ESTIMATE</span>
                    <p>
                      Scenario estimate for prioritization. Not a fine notice or
                      a prediction of enforcement. Each finding includes its
                      basis.
                    </p>
                  </div>
                </div>
                <div className="metrics">
                  <div>
                    <span>Flagged findings</span>
                    <strong>
                      {flagged.length.toString().padStart(2, "0")}
                      <small> / {findings.length}</small>
                    </strong>
                  </div>
                  <div className="metric-row">
                    <span>Pages reviewed</span>
                    <strong>
                      {report.pages_scraped.length.toString().padStart(2, "0")}
                    </strong>
                  </div>
                  <div className="metric-revenue">
                    <span>
                      Annual revenue ·{" "}
                      {report.revenue_assumed ? "assumed" : "provided"}
                    </span>
                    <b>{money(report.revenue_used)}</b>
                  </div>
                </div>
              </div>
              <div className="section-heading findings-heading" id="findings">
                <div className="report-title">
                  <span className="section-number">03</span>
                  <h2>
                    The findings<span className="count">{findings.length}</span>
                  </h2>
                </div>
                <span className="muted">
                  Open a row for evidence & recommendations
                </span>
              </div>
              {flagged.length === 0 && (
                <p className="coverage">
                  No rules were flagged in the reviewed material. This does not
                  confirm legal compliance.
                </p>
              )}
              <div className="ledger-labels">
                <span>PRIORITY / RULE</span>
                <span>MODELED EXPOSURE</span>
              </div>
              <ViolationGrid findings={findings} />
              <details className="briefing">
                <summary>
                  <span>Auditor’s briefing</span>
                  <span className="expand">+</span>
                </summary>
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
                <span className="eyebrow">SOURCE REGISTER</span>
                {report.pages_scraped.map((p, index) => (
                  <div key={p}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {safeUrl(p) ? (
                      <a href={safeUrl(p)} target="_blank" rel="noreferrer">
                        {p}
                        <ArrowUpRight size={14} />
                      </a>
                    ) : (
                      <span>{p}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            !busy && (
              <section className="scope-section">
                <div>
                  <span className="eyebrow">WHAT THE REVIEW COVERS</span>
                  <h2>
                    Public pages and
                    <br />
                    privacy disclosures.
                  </h2>
                </div>
                <p>
                  We inspect the text available on your website and privacy
                  policy. Every flagged rule comes with an observation, a
                  financial basis and a recommended change. Internal practices
                  still need an auditor’s review.
                </p>
                <a
                  href="https://uaelegislation.gov.ae/en/legislations/1972"
                  target="_blank"
                  rel="noreferrer"
                  className="scope-reference"
                >
                  Federal Decree-Law
                  <br />
                  <strong>No. 45 / 2021</strong>
                  <span>
                    Legal foundation <ArrowUpRight size={14} />
                  </span>
                </a>
              </section>
            )
          )}
          <footer>
            <span>COMPLYRISK / UAE</span>
            <p>
              Public-site screening. Legal applicability and internal practices
              require confirmation.
            </p>
            <span>V 0.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
