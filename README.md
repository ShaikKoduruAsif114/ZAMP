# Vendorly — PS-2 vendor onboarding

A working vendor onboarding app for the vendor onboarding case study. It accepts editable forms, structured JSON submissions, and TXT/JSON evidence, executes a deterministic policy, and returns approved, pending, or rejected with reasons and a vendor follow-up draft.

## Live application

https://vendorly-onboarding-ps2-n7k4.lattergardenia1.chatgpt.site

The deployed application is publicly accessible. Vendor records stay in the browser that creates them.

## Run locally

Use Node.js 24.15+ (or Node.js 22.22.2+):

```sh
npm ci
npm start
```

Open http://localhost:8000. The static app has no runtime package dependencies; `npm ci` installs the test tools. `PORT` defaults to 8000. HTTPS or localhost is required for Web Crypto account fingerprints.

## GitHub automation and deployment

- `.github/workflows/ci.yml` runs the complete automated test suite on pushes to `main` and pull requests.
- The existing live application uses Sites hosting. GitHub Pages is an additional deployment option: in repository **Settings → Pages**, choose **GitHub Actions** as the source, then run **Actions → Deploy GitHub Pages → Run workflow**. The workflow publishes `dist/` after the tests pass. No application secrets are needed.
- The `.openai/hosting.json` file retains the existing Sites project identity. It contains no deployment credentials.

## Project layout

- `dist/`: complete browser app and deterministic decision engine.
- `tests/`: rule-engine and interface workflow tests.
- `scripts/serve.mjs`: dependency-free local HTTP server.
- `.github/workflows/`: test and optional Pages deployment workflows.

## Validation

`npm ci` then `npm test`. The app has no runtime package dependencies. Its Google Fonts stylesheet is optional; local font fallbacks remain available.

## Distinctive features

- Country-aware checks for US EIN/ABA, UK VAT/sort code, and India GSTIN/IFSC, including GSTIN check digit validation.
- Cross-document field consistency, expiry checks, missing evidence, and readable-format handling.
- Normalized entity names and bank-account collision checks using SHA-256 fingerprints.
- Real execution stages, detailed reasoning, actionable follow-up drafts, and downloadable audit reports.
- Corrections and rechecks with immutable prior run results, per-run input snapshots, and changed-check summaries.
- Searchable queue, status and country filters, CSV exports, workspace backup/restore, and ten editable scenarios with an isolated test runner.
- Approved-bank change holds with a reviewer attestation bound to the specific vendor, identity, previous account, and new account. The hold persists on reruns. A note never overrides unrelated blocking findings.
- An action center prioritizing blocking findings, bank changes, approaching/expired compliance evidence, and aged pending work. Dates use India business time; expiry warnings do not rewrite past decisions.
- Automated document cross-referencing comparing extracted fields from tax documents, bank letters, and compliance declarations against form submissions.
- A ten-case scenario suite that executes the real decision engine with isolated sample history, checks expected findings, and exports the actual results without writing vendors.
- Responsive layouts, keyboard-accessible controls, labeled forms, focus styles, and reduced motion support.

## Scope and assumptions

The app performs local consistency checks; it does not establish a vendor's legitimacy. US and UK tax IDs are format-checked. India GSTINs also undergo base-36 check digit validation. No tax registry is queried. No sanctions data, bank verification API, OCR, or email delivery is connected. Unsupported document formats go to pending review rather than being guessed. TXT and JSON are explicit evidence inputs; original uploads are not retained.

Records are persisted in browser localStorage, scoped to the current browser and site origin. There is no shared backend or multi-user queue. Full account numbers are never written to storage: only the last four digits, a SHA-256 fingerprint, and the outcome of the structure check are saved. Extracted names, contact details, tax IDs, and routing codes remain in the local record. Export backups before switching devices or clearing browser storage.

Approved means all configured checks passed. A blocking beneficiary or shared-bank finding takes precedence over missing information. This is a runnable case-study prototype; a production rollout would add authenticated intake, encrypted shared storage, trusted verification providers, secure vendor remediation links, server-side policy enforcement, and operational monitoring.

## Added edge cases (policy V1.1)

| Scenario | Expected result | Why |
| --- | --- | --- |
| Changed account after approval | Pending | Matching documents cannot release a payment-change hold; a trusted contact confirmation must be recorded. |
| Mixed Latin/Cyrillic company name | Pending | Lookalike characters can be consistent across every field while still needing official spelling confirmation. |
| Invoice uploaded as tax evidence | Pending | A declared document type must match its slot, even when copied fields agree. |
| GSTIN with a bad check digit | Pending | A realistic-looking number can pass the pattern and still fail internal checksum validation. |
| Reused tax identity under a different company name | Pending | The duplicate company needs review before another vendor is created. |

The original missing-document, beneficiary-mismatch, expiry/tax-conflict, and bank-collision examples remain. The isolated suite includes all nine edge cases and a happy path.

Reviewer bank confirmations are locally recorded attestations, not proof from a bank or authenticated reviewer service. A browser user can edit local records; server-enforced roles and approvals remain outside this prototype. Mixed-script detection requests review rather than declaring fraud.

Existing V1.0 decisions and history are preserved. The UI offers an explicit recheck under V1.1. Legacy records with a previously passed account structure check remain recheckable; a previously failed structure check cannot become valid merely because its raw number was removed.

## Demo (under five minutes)

1. Overview → Action center: show priority order and the compliance expiry watch (30 sec).
2. Scenario lab → Run all 10 scenarios: explain actual vs expected outcomes and isolated history (45 sec).
3. Load the mixed-script or checksum scenario and run it; point to the exact rule and follow-up (45 sec).
4. Load the bank-change scenario for an approved vendor. Run it, show the hold, then rerun to prove it persists (60 sec).
5. Record an independent contact confirmation, rerun, and inspect the reviewer note in history (60 sec).
6. On a rejected beneficiary, show the Evidence cross-check flagging the conflict, and demonstrate the recheck flow (45 sec).
7. Explain the local-only and external verification limits (15 sec).

The attached candidate guide is requirements context. This build does not contact a hiring coordinator or submit anything on the user's behalf.
