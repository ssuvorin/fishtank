# Frontend review — 2026-09-25

Reviewed spec, plan, tasks, data model and API contract at `0ec5d2a` (including the live-only clarification) against the agreed website → monetary exposure → evidence → remediation flow. Money remains the primary result. Frontend implementation does not alter scoring, rules or the legal corpus.

## Corrections included in this PR

- T013 reversed the documented conversion: AED → USD must divide by 3.673; USD → AED multiplies. This is an internal arithmetic correction to the existing fixed-rate contract.
- T014 must return all ten rules. Unflagged results are not proof of compliance.
- T019 cannot report real stage completion from elapsed-time guesses. The single POST supports a spinner, elapsed time and workflow description; actual stage events require a backend contract change.
- Export preserves the full response and its coverage/revenue assumptions, rather than the abbreviated example that dropped them.
- Optional finding-level source URL, legal-source URL and quote/absence discriminator are documented. The current UI explicitly discloses missing attribution rather than guessing it.

## Backend/spec integration decisions still needed

1. **Applicability (high priority):** user chose Federal Decree-Law 45/2021 as the foundation. The current plan mixes UAE, DIFC and EU rules in one total without applicability inputs or per-rule applicability output. Decide applicability before presenting this as an applicable legal-liability total. Frontend labels the figure modeled exposure and retains each rule's law and basis; this does not resolve the backend scope problem.
2. **Currency (high priority):** law.json includes EUR frameworks but the contract only defines the AED/USD rate. Specify EUR conversion and formula units before summing these rules. Do not silently treat EUR as USD.
3. **Live-only demo:** the newer spec removes fixture mode. This frontend follows that decision: every submission calls the real API; no canned report mode or local scores are shipped.
4. **Evidence traceability:** populate the additive source and evidence-kind fields. Aggregate pages_scraped alone cannot attribute a particular excerpt or absence observation.
5. **Integration:** backend must enable CORS for the actual frontend origin, return the contract's top-level revenue/coverage fields, and return all ten findings. Backend implementation from main `e23b7a5` has been merged; live scoring and synthesis remain unverified in this frontend task.

## Frontend handoff

Implementation covers the user-facing outcomes of T003, T017–T022 and T025 in a compact React app. Task checkboxes remain unchanged pending integration acceptance. It uses `styles.css`; equivalent components are composed in App.tsx rather than creating one file for each visual section.

Browser tests intercept the API only inside Playwright tests. No fixture scores are shipped in the application. Tests exercise successful/limited reports, source safety, full offline export, scoring errors, incomplete responses, cancellation and mobile width. Real end-to-end legal/scoring validation is a separate backend integration check.

## Visual redesign

The second pass replaces the dark dashboard with a paper-and-ink layout, section navigation, a ledger of findings and a larger monetary estimate. The ElevenLabs Matrix is vendored with its MIT license and uses local patterns for idle/scanning states. No API key or audio feature is involved. Unused components from the parallel frontend implementation were removed when integrating main.
