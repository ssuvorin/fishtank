# Feature Specification: AI Compliance & Financial Risk Auditor (ComplyRisk AI)

**Feature Branch**: `001-compliance-risk-audit`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Web application that accepts a company's website URL (plus optional annual revenue, defaulting to USD 5,000,000), scrapes the landing page and its discovered privacy-policy page, evaluates the site's published practices against a curated set of 10 UAE-first data-protection rules (UAE PDPL and DIFC DPL primary, GDPR as EU-expansion exposure), scores each rule with a calibrated violation probability, and returns total legal financial exposure as a CFO/CISO metric in USD and AED — plus a severity-ranked findings grid and an exportable Executive Action Plan."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit a URL, Get a Financial Exposure Number (Priority: P1)

An auditor (compliance officer, consultant, or founder) opens the app, pastes a company website URL, optionally enters the company's annual revenue, and clicks "Audit". The system fetches the landing page, discovers and follows the privacy-policy link, extracts the policy text, evaluates all 10 legal rules in the knowledge base against that text, and returns a headline figure: total legal exposure in USD and AED, plus a per-rule pass/flag verdict list.

**Why this priority**: This is the entire value proposition — "compliance as a CFO number". Without URL-in → exposure-out, nothing else exists to show. It is independently demoable and delivers the core pitch on its own.

**Independent Test**: Can be fully tested by submitting a real, live URL (e.g., a UAE-facing startup site) with no other features built; success is a total exposure figure displayed in both USD and AED with all 10 rules marked compliant/at-risk. Delivers standalone value: an instant quantified compliance snapshot.

**Acceptance Scenarios**:

1. **Given** a reachable website URL with a discoverable privacy-policy page and the revenue field left empty, **When** the auditor submits the audit, **Then** the system scrapes the landing and privacy pages, evaluates all 10 rules, and displays total legal exposure in USD and AED (converted at the 3.673 peg) using the USD 5,000,000 default revenue for turnover-scaled rules.
2. **Given** a reachable website URL and a user-entered annual revenue of USD 50,000,000, **When** the audit is submitted, **Then** turnover-scaled rule exposures are computed against USD 50,000,000 rather than the default.
3. **Given** a malformed or unreachable URL, **When** the auditor submits the audit, **Then** the system returns a clear, human-readable error (e.g., "Could not reach this site") without a partial or misleading exposure figure.
4. **Given** a reachable site whose privacy link is missing or blocked, **When** the audit is submitted, **Then** the system still completes the audit against whatever text was obtainable and clearly flags which rules could not be fully evidenced.

---

### User Story 2 - Review the Severity Grid of Violations (Priority: P2)

A CISO or CFO viewing the audit result sees a severity-ranked grid (Critical / High / Medium) of detected violations. Each violation card shows: the compliance category, the exact law and article citations (e.g., "UAE PDPL Art. 22", "GDPR Art. 7"), the calibrated violation probability, the individual financial exposure attributed to that rule, a direct evidence quote extracted from the site's own policy text, and a concrete remediation step.

**Why this priority**: The headline number gets attention; the per-violation grid earns trust. Judges and real users need to see *why* the number is what it is — citations and evidence quotes are what separate a quantified risk tool from a random number generator. It depends on US1's pipeline but is a separately demonstrable surface.

**Independent Test**: Can be fully tested by running any completed audit and inspecting the grid: each flagged rule must display category, citations, probability, exposure, a verbatim site-text evidence quote, and remediation guidance. Delivers standalone value as a defensible findings report even without export.

**Acceptance Scenarios**:

1. **Given** a completed audit with at least one flagged rule, **When** the results view renders, **Then** violations are ordered by severity (Critical → High → Medium) and each shows category, law/article citations, calibrated probability, USD/AED exposure, an evidence quote from the scraped text, and a remediation step.
2. **Given** a completed audit where a rule scored a low violation probability, **When** the grid renders, **Then** that rule is shown as compliant/not-flagged rather than listed as a violation.

---

### User Story 3 - Export the Executive Action Plan (Priority: P3)

A user clicks "Export Action Plan" and downloads a JSON document containing an executive briefing narrative (a C-level summary of the overall risk posture), the total exposure figure in both currencies, and a prioritized remediation list ordered by exposure reduction.

**Why this priority**: Export turns the on-screen finding into a deliverable a consultant can hand to a client or a CISO can attach to a board pack. Valuable, but the audit and grid already deliver the pitch; export is the take-away artifact, not the demo's core.

**Independent Test**: Can be fully tested by completing any audit, clicking export, and opening the downloaded file: it must be valid JSON containing the briefing narrative, per-rule results, total exposure in USD and AED, and a prioritized remediation list. Delivers standalone value as a portable audit artifact.

**Acceptance Scenarios**:

1. **Given** a completed audit, **When** the user clicks "Export Action Plan", **Then** a valid JSON file downloads containing an executive briefing narrative, total exposure (USD + AED), all 10 rule outcomes with probabilities and evidence, and a remediation list ordered by exposure impact.
2. **Given** a completed audit, **When** the exported JSON is parsed by a standard JSON parser, **Then** it parses without errors and all required fields are present.

---

### Edge Cases

- **No privacy page found**: the landing page is reachable but no privacy-policy link is discoverable. The system completes the audit against the landing-page text alone, flags rules requiring policy language as likely violated (their assertions concern *missing* clauses), and clearly indicates limited evidence coverage.
- **JS-only / heavily rendered site**: static fetch returns an empty or boilerplate DOM. The system falls back to a dynamic (browser-rendered) fetch before giving up; if even rendered text is unusable, it reports a clear "could not extract readable content" error rather than scoring an empty document.
- **Unreachable, invalid, or blocked URL**: DNS failures, timeouts, HTTP 4xx/5xx, and anti-bot blocks each produce a distinct, human-readable error; no exposure figure is shown.
- **Missing optional inputs**: omitted annual revenue defaults to USD 5,000,000 for all turnover-scaled rules; the UI states the assumed value.
- **External scoring service failure or timeout**: if the probability-scoring or narrative-synthesis calls fail or exceed the per-request timeout, the audit reports a degraded result (probabilities unavailable) or a clear retryable error — never fabricated scores.
- **Non-English policy text**: the audit proceeds but flags reduced confidence, since the rule assertions are tuned for English-language policy language.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept a website URL and an optional annual revenue figure from the user; when revenue is omitted or invalid, it MUST default to USD 5,000,000 and disclose the assumption.
- **FR-002**: The system MUST fetch the submitted landing page and automatically discover and follow the site's privacy-policy link (e.g., /privacy, privacy-policy, data-protection) before scoring.
- **FR-003**: The system MUST extract readable policy text from fetched pages, and MUST fall back to a dynamic/JS-rendered fetch when static fetching yields insufficient content.
- **FR-004**: The system MUST evaluate every one of the 10 rules in the legal knowledge base (`law.json`) against the extracted text — no rule may be silently skipped.
- **FR-005**: The system MUST obtain a calibrated violation probability (0.0–1.0) per rule via a single batched live call to the external probability-scoring service (Jev `noul` assertions via the OpenRouter decisions endpoint); scoring MUST reflect the scraped text, not cached or hardcoded values.
- **FR-006**: The system MUST compute per-rule exposure as `default_exposure_calc × violation_probability`; for turnover-based rules, `default_exposure_calc` resolves against the user-provided (or default) annual revenue per the rule's penalty-framework formula.
- **FR-007**: The system MUST present total and per-rule exposure in both USD and AED, converting at the fixed peg of 1 USD = 3.673 AED.
- **FR-008**: The system MUST display flagged violations in a severity-ranked grid where each violation shows: compliance category, law and article citations, calibrated probability, exposure in both currencies, a verbatim evidence quote from the site's own text, and a remediation step.
- **FR-009**: The system MUST generate an executive briefing narrative and prioritized remediation list via the external narrative-synthesis model, grounded in the audit's actual rule results.
- **FR-010**: Users MUST be able to export the Executive Action Plan as a downloadable JSON file containing the briefing narrative, total exposure in both currencies, per-rule results, and the prioritized remediation list.
- **FR-011**: The system MUST return distinct, human-readable errors for malformed URLs, unreachable hosts, HTTP error responses, blocked/anti-bot responses, and pages with no extractable text — and MUST NOT display a partial exposure figure in these cases.
- **FR-012**: Each external call (page fetch, probability scoring, narrative synthesis) MUST be bounded by a per-request timeout so a single slow dependency cannot hang the audit; the full audit MUST complete within 90 seconds end-to-end for a normal site.
- **FR-013**: The system MUST treat each submission as a fresh, independent audit: no caching of prior audit results into new requests.
- **FR-014**: When policy text cannot be obtained but the landing page was reachable, the system MUST still complete the audit on available text and annotate the result with reduced evidence coverage rather than failing outright.

### Key Entities *(include if feature involves data)*

- **AuditRequest**: A single audit submission — the target URL, the effective annual revenue (user-supplied or the USD 5M default), and request-scoped state (timestamps, scrape status, errors).
- **ScrapedDocument**: Text extracted from a fetched page (landing or privacy policy) — source URL, extraction method (static vs. rendered), raw readable text, and coverage notes (e.g., "privacy page not found").
- **Rule**: A legal rule from the knowledge base — id, compliance category, jurisdiction, law and article citations, check description, violation assertion (the boolean question scored), penalty framework with `default_exposure_calc` (a fixed amount or turnover-scaled formula), severity, canonical evidence note, source URL, and remediation guidance.
- **ViolationResult**: The outcome of evaluating one Rule against a site's text — calibrated violation probability, flagged/compliant verdict, per-rule exposure (USD and AED), and the extracted evidence quote.
- **ExposureSummary**: The aggregate audit result — total exposure in USD and AED, counts by severity, and the full list of ViolationResults.
- **ActionPlan**: The exportable artifact — executive briefing narrative, the ExposureSummary, and a remediation list prioritized by exposure reduction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A full audit for a normal, reachable site completes end-to-end — submission to rendered exposure figure — in under 90 seconds.
- **SC-002**: Every completed audit produces a scored outcome for all 10 knowledge-base rules; no rule is silently omitted.
- **SC-003**: Total and per-rule exposure are displayed in both USD and AED on every successful audit result.
- **SC-004**: Every flagged violation in the severity grid shows all six required fields: category, law/article citation, calibrated probability, exposure, verbatim evidence quote, and remediation step.
- **SC-005**: The exported Action Plan downloads as a file that parses as valid JSON and contains the briefing narrative, exposure summary, per-rule results, and prioritized remediation list.
- **SC-006**: Malformed, unreachable, or un-extractable submissions produce a clear error message and zero fabricated exposure in 100% of cases.
- **SC-007**: A judge or user can go from landing on the app to seeing a quantified exposure figure in a single interaction (URL in → number out), with no setup or configuration.

## Assumptions

- **UAE PDPL penalties are analyst estimates**: the UAE PDPL fine schedule is delegated to a Cabinet decision that has not been published; all AED `default_exposure_calc` amounts in `law.json` marked `basis: "estimate"` are analyst estimates for risk-quantification purposes, not statutory penalties. DIFC Schedule 2 fines and GDPR turnover percentages are statutory where marked.
- **Single audit per request**: each submission is one independent audit of one site; no batch mode, history, or multi-URL comparison is in scope.
- **English-language policies are the primary target**: rule assertions assume English policy text; other languages may score with reduced reliability.
- **Public, unauthenticated pages only**: the audit covers content reachable without login; paywalled or consent-walled content that cannot be fetched counts as missing evidence.
- **Fixed USD/AED peg**: conversion uses the UAE central-bank peg of 3.673 and is not a live FX rate.
- **External services are available**: the OpenRouter decisions endpoint (Jev scoring) and chat endpoint (narrative synthesis) are reachable and correctly configured via environment; venue-network resilience is a deployment concern (demo mode), not a spec requirement.
- **Output is advisory, not legal advice**: figures represent modeled exposure for prioritization, presented as such to users.
