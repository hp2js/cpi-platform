# Frontend implementation plan

Status: approved to start, under team review · Progress: Phases 0–2 complete (26 September 2026) · Scope: `apps/web` against a mocked API · Sources: PRD v1.1 (`docs/HP2JS — Adili-V3-Track-2-PRD.md`), Linear project _Adili V3 — Track 2_.

This plan builds the complete P0 frontend for all four roles before the backend exists. A mock API stands in for the server and behaves like one: it enforces role scope, versions, deadlines and conflicts, so the UI is built against realistic responses rather than happy-path fixtures. When the real API lands, the mock is switched off and the screens stay.

## 1. Principles carried from the PRD

These shape every screen and are checked at each review point.

1. **Each role lands on its own next action, in its own layout** (§11). No shared dashboard with menu items hidden.
2. **The server is the authority.** Route guards only improve navigation; the mock API independently returns 401/403/404 for out-of-scope requests (AT01, AT02), and the UI handles them.
3. **The frontend never computes an authoritative score** (§15). Scores, fractions, deadlines, lateness and state transitions come from the API. In this phase the mock API computes them in `src/mocks/`, isolated from UI code and removed at integration.
4. **Pending is never zero.** Distinct rendering for _pending baseline approval_, _awaiting review_, _not yet due_, _missing_ and _finalized 0_ (§7.5, §10.5).
5. **Claims, evidence and acceptance are different things.** No green "compliant" badge because a file exists (§11). Provisional and reviewed values are always labelled.
6. **Institutions never see numbers before publication** (O06 default). They see workflow status and feedback only.
7. **Plain status language, never colour alone**; Africa/Nairobi time and financial-year context on every deadline (§11).
8. **Simulation is always visible**: simulated business time and the _Hackathon Mock v1 — simulation profile, not official EACC scoring_ label appear on internal score screens and exports (§7.1, FR14).

## 2. Personas, accounts and layouts

The mock seeds the fixture cast from PRD §17.1. Sign-in is a labelled demo account picker; it will be replaced by real authentication (HP2-13/HP2-14).

| Persona                  | Demo accounts                                 | Layout                                                                                                                                                                              | Lands on                                                                        |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Institution focal person | One per DEMO-001 … DEMO-008                   | **Task layout.** Top bar with institution name, current period and next deadline; single-column content; bottom navigation on mobile. Optimised for form entry on laptop and phone. | "What is due and what needs attention": obligations, clarifications, deadlines. |
| Prevention officer       | Officer A (DEMO-001–004), Officer B (005–008) | **Workspace layout.** Left rail with portfolio and queue counts; dense split-pane review (claim · rule · evidence · decision). Collapses to stacked panels on narrow screens.       | Assigned work queue, oldest unresolved first.                                   |
| Supervisor               | One supervisor                                | **Oversight layout.** Full-width analytics with a persistent filter bar (cycle, quarter, institution, officer) held in the URL. Every chart paired with its table.                  | Coverage and bottlenecks.                                                       |
| Administrator            | One administrator (also the demo operator)    | **Console layout.** Grouped sidebar: Setup, Forms & scoring, Publication, Operations. Elevated actions visually distinct and require a justification.                               | Publishing readiness, assignments, failed notifications.                        |

All layouts share: skip link, simulation banner (business time + run ID), inbox entry point, account menu with sign-out, and a consistent page header (title, context, primary action).

## 3. Route map

Code-based TanStack Router, one subtree per role. `beforeLoad` redirects signed-out users to `/sign-in` and wrong-role users to a _forbidden_ page. Filters, tabs, quarter and revision selections live in validated search params so views survive refresh and can be shared.

```text
/sign-in                                  demo account picker
/                                         redirect to the signed-in role's home
/forbidden, /session-expired, 404

/institution                              home: obligations, next actions, deadlines
/institution/foundations                  procedures, risk assessment, mitigation plan versions
/institution/plan                         risk register, activities, milestones, baseline status, amendments
/institution/reports/$periodId            quarterly report editor (draft)
/institution/reports/$periodId/review     review-before-submit and attestation
/institution/receipts/$receiptId          immutable receipt
/institution/history                      revisions and receipts across the year
/institution/clarifications(/$id)         requests and responses
/institution/results                      withheld until release; own published report and versions
/institution/inbox

/officer                                  work queue (tabs in search params)
/officer/portfolio                        assigned institutions × quarters
/officer/institutions/$institutionId      assigned-only overview
/officer/baselines/$baselineId            baseline approval with anti-gaming checks
/officer/foundations/$foundationId        foundation checklist review
/officer/reviews/$submissionId            review workspace (?revision=)
/officer/clarifications
/officer/inbox

/supervisor                               overview metrics
/supervisor/coverage                      8 × 4 institution-quarter matrix
/supervisor/backlog                       review backlog and officer workload
/supervisor/institutions/$institutionId   read-only drilldown
/supervisor/comparison                    same-profile, finalized-only comparison
/supervisor/annual                        release readiness (read only)
/supervisor/reports                       consolidated report and exports
/supervisor/inbox

/admin                                    console home
/admin/cycle                              financial year, periods, deadlines, cutoff, reminders
/admin/institutions, /admin/users         directory, membership, deactivation
/admin/assignments                        officer portfolios and reassignment history
/admin/forms(/$formId)                    constrained form editor, preview, publish, versions
/admin/profile                            scoring profile (locked after activation)
/admin/annual                             evaluation readiness, batch publication, corrections
/admin/notifications                      failure queue, retries, demo email sink
/admin/audit                              audit log
/admin/simulation                         clock, named boundaries, run reset
```

## 4. Screen inventory

Each screen lists the states it must render. "States" always includes loading, error with retry, empty, and forbidden.

### 4.1 Institution (HP2-21, HP2-27, part of HP2-31/32)

| Screen                  | Must show / do                                                                                                                                                                                                                                                                                                                                            | PRD / tests                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Home                    | Four quarter obligations with workflow state plus separate flags (late, evidence incomplete, not yet due, clarification overdue); the foundation deadline (30 Sep) shown separately from the quarterly deadline (15 Oct); baseline status; open clarifications; one clear next action.                                                                    | §7.2, §7.5, §9.1             |
| Foundations             | Versions of procedures, risk assessment and plan with approval reference, effective-from/to, status (active/superseded/withdrawn); upload a new version; never implies a new upload was valid earlier.                                                                                                                                                    | §10.3, FR04, AT28            |
| Plan & baseline         | Risk rows (1–5 probability × impact, stored product, **no invented severity bands**, O16); activities and milestones with due quarter, KPI, target, owner; baseline status incl. _Pending approval_ and _SEEDED HISTORICAL BASELINE_; request a future-period amendment with reason. Deleting a locked milestone is not offered.                          | FR04, §10.4, AT17, AT25      |
| Quarterly report editor | Questions grouped by deliverable, from the published form version; per-milestone claim, output achieved, emerging issues, actions, remarks; evidence references to CPC/IAO minutes with page/section; explicit "evidence not available" declarations; explicit save with visible saved state and draft recovery after refresh; field-level server errors. | FR05, FR06, §9.2, AT07       |
| Evidence upload         | Allowlist and size limits explained beside the field; progress bar; retry without duplicating a completed upload; rejected files explained (e.g. disguised executable).                                                                                                                                                                                   | FR06, AT21                   |
| Review before submit    | Completion check separating unanswered questions from honest declarations; authority attestation (blocks submit if missing, draft kept); institutional approval reference or "not available" declaration; submit with an idempotency key so a retry cannot double-submit.                                                                                 | §7.2, AT06, AT26             |
| Receipt                 | Institution, period, revision, server receipt time (EAT), timeliness, evidence inventory, and _Provisional calculation recorded_ or _Pending baseline approval_ — no number. Retrievable later.                                                                                                                                                           | FR07                         |
| History                 | All revisions and receipts; earlier ones read-only.                                                                                                                                                                                                                                                                                                       | §7.2, AT09                   |
| Clarifications          | Criterion, question, requested evidence, response deadline with its basis, extension or _Extension decision required_ status; respond by creating a revised submission; earlier receipt preserved; explains that late evidence can prove on-time completion.                                                                                              | §7.3, FR09, AT09, AT29       |
| Results                 | Before release: "Results are published after annual evaluation" and review-complete status without scores. After release: own score, components, quarter-by-quarter explanation, late flags, superseded versions, print view, own export.                                                                                                                 | FR13, AT18, AT19, AT20, AT32 |
| Inbox                   | Notifications with authorized links only, read state, reminders.                                                                                                                                                                                                                                                                                          | FR11                         |

### 4.2 Prevention officer (HP2-24)

| Screen            | Must show / do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PRD / tests                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Work queue        | Tabs: awaiting my review, needs re-review, awaiting institution (clarification), baselines to approve, closed. Review age (from current receipt) and case age (from first submission) shown separately.                                                                                                                                                                                                                                                                                                                                           | §4.3, §7.3                         |
| Portfolio         | Four assigned institutions × four quarters, state and flags, provisional vs reviewed labelled.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | FR12                               |
| Baseline approval | Milestones due per quarter; checks for material risk coverage, objective completion conditions, mandatory CPC/IAO obligations, duplicate or artificially split milestones; plan size shown; rationale required; activation blocked until resolved (the inflated 12-milestone case); historical-seed confirmation.                                                                                                                                                                                                                                 | §10.4, §10.7, AT25, AT31           |
| Foundation review | Four checks per indicator, each with cited passage; version effective at cutoff selected explicitly.                                                                                                                                                                                                                                                                                                                                                                                                                                              | §10.3, AT28                        |
| Review workspace  | Per criterion: claim · rule · evidence (authorized preview/download, cited passage) · decision (accept/reject with reason, suitability checklist Pass/Deficient/N/A). Provisional vs reviewed results from the server. Revision selector with both versions and timestamps. _Needs re-review_ flags after dependency changes; explicit carry-forward confirmation. Request clarification. Finalize (409 on a stale revision is shown as a conflict with a path to the latest). Reopen with reason. Close nonresponse only when the API allows it. | FR09, FR10, AT08, AT10, AT27, AT30 |
| Clarifications    | Open requests with response windows and extension state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | §7.3                               |
| Inbox             | As institution, scoped to assignments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | FR11                               |

### 4.3 Supervisor (HP2-31, HP2-32)

| Screen                | Must show / do                                                                                                                                                              | PRD / tests |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Overview              | The seven §4.3 metrics, each with numerator, denominator and as-of time; _Not applicable_ for a zero denominator; backlog split into officer action and institution action. | §4.3, FR12  |
| Coverage matrix       | 8 × 4 grid of institution-quarter state with text flags; closed-nonresponse counted separately.                                                                             | FR12, AT13  |
| Backlog & workload    | Per-officer queues, review age, unresolved clarifications; non-gating oversight comments.                                                                                   | §7.3        |
| Institution drilldown | Submitted records only (no drafts), internal provisional vs reviewed.                                                                                                       | §5.2        |
| Comparison            | Same cycle and profile, finalized periods only, coverage and plan size beside each value, limitations text; never a ranking.                                                | §10.7       |
| Annual readiness      | Which institutions are releasable and why not.                                                                                                                              | §7.6        |
| Reports               | Consolidated report, print view, CSV/JSON export.                                                                                                                           | FR13, FR16  |

Charts are simple SVG bars built in-house (no chart library), each followed by an equivalent table. Pending values are never plotted as zero.

### 4.4 Administrator (HP2-16, HP2-27, HP2-31, HP2-32)

| Screen               | Must show / do                                                                                                                                                                                                                                                                                                                                                                                                                                                              | PRD / tests            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Console home         | Publication coverage, assignment gaps, failed notifications, next actions.                                                                                                                                                                                                                                                                                                                                                                                                  | §11                    |
| Cycle & calendar     | FY 2026/27 periods, quarterly deadlines, separate foundation deadline, evaluation cutoff, timezone, reminders; lateness cannot be removed by editing a past deadline.                                                                                                                                                                                                                                                                                                       | FR02, AT11             |
| Institutions & users | Directory, membership, deactivation (sessions revoked).                                                                                                                                                                                                                                                                                                                                                                                                                     | FR01, AT22             |
| Assignments          | Officer portfolios, reassignment with history preserved.                                                                                                                                                                                                                                                                                                                                                                                                                    | FR01, AT22             |
| Form editor          | Structured editor (no drag-and-drop): sections; question types text, number, date, yes/no, choice, evidence reference, repeated activity rows; informational vs scored; required, help text, evidence category, checklist items, weights. Live validation (weights total 100, unique IDs, all periods assigned), preview as the institution sees it, publish to an immutable version, version list. Scoring edits after activation are refused with the policy explanation. | FR03, AT03, AT04, AT05 |
| Scoring profile      | Hackathon Mock v1 (10/15/15/60) read-only once locked; 23rd Cycle reference (10/10/80) shown as documentation only.                                                                                                                                                                                                                                                                                                                                                         | §10.1                  |
| Annual evaluation    | Readiness per institution (four dispositions + foundation decisions), publish a ready batch, consolidated report naming unreleased institutions, correction cases creating a new published version.                                                                                                                                                                                                                                                                         | §7.4, §7.6, AT19, AT20 |
| Notifications        | Failure queue with retry and attempt history; demo email sink.                                                                                                                                                                                                                                                                                                                                                                                                              | FR11, AT12             |
| Audit log            | Actor, action, object version, actual time and simulated time; filterable; read-only.                                                                                                                                                                                                                                                                                                                                                                                       | FR10                   |
| Simulation           | Advance to named boundaries (quarter open, due, overdue, year-end, publication); run ID; reset the run. Elevated and confirmed.                                                                                                                                                                                                                                                                                                                                             | FR14, AT13, AT24       |

## 5. Mock API

**Mock Service Worker (MSW 2.x)** intercepts `fetch` at the network layer, so `src/lib/api.ts`, Query hooks and error handling are the same code that will talk to the real server. The same handlers run in the browser (dev), in Vitest (`msw/node`) and under Playwright.

```text
src/mocks/
  browser.ts, node.ts      worker/server setup
  db.ts                    in-memory store; persisted to localStorage so a reload keeps the demo state
  seed/                    DEMO-001…008, users, cycle, form v1, plans, scenario history (§17.1)
  services/                session, scope checks, clock, workflow transitions, scoring, notifications, audit
  handlers/                REST routes grouped by feature, calling services
```

Behaviour the mock must reproduce, because the UI depends on it:

- **Scope**: every handler resolves the session and checks institution ownership or current assignment; out-of-scope reads return 404/403 without leaking names or counts.
- **Versions and conflicts**: submissions are immutable revisions; finalize and decision writes carry the revision they assessed and return **409** when stale; submit honours an `Idempotency-Key`.
- **Business time**: a server-side simulated clock in Africa/Nairobi; deadline classification (at 23:59:59 is on time; one second later is late) happens in the mock, never in components.
- **Scoring**: Section 10 rules (checklists, locked milestone denominator, equal quarters, foundations once, half-up display rounding) in `services/scoring.ts`, verified against the 88.75, 70.00 and 96.25 fixtures. This is a stand-in for HP2-18, not a second authority.
- **Realism controls** (dev toolbar, dev builds only): latency, forced failure for the next request, session expiry, notification-delivery failure. These exercise the recovery paths HP2-35 requires.

Switching: `VITE_API_MODE=mock` enables the worker (default for `pnpm dev` until the backend is ready). Production builds exclude MSW and its worker script entirely.

## 6. Contracts

Responses are validated with zod schemas (the existing `request(path, schema)` pattern). The schemas for this plan — institutions, periods, obligations, submissions, evidence, clarifications, decisions, scores (with explicit `pending` variants), metrics, publications, notifications, audit — are written as a **proposal for HP2-9**. They live in `packages/contracts` under a draft module (§10). They encode the PRD's non-negotiables in types: e.g. a score is `{ status: 'pending', reason }` or `{ status: 'calculated', … }`, never a nullable number.

## 7. Shared UI building blocks

- **Status vocabulary**: one `WorkflowState` badge (icon + text) for the seven §7.5 states and separate `Flag` chips for late / evidence incomplete / not yet due / clarification overdue / needs re-review.
- **Score display**: always labelled Provisional, Reviewed or Published, with profile name; renders pending reasons instead of numbers.
- **Dates**: one formatter using `Intl.DateTimeFormat` with `Africa/Nairobi`; deadlines show "EAT" and FY context; simulated and actual times styled differently.
- **Metric card**: value plus numerator/denominator/as-of, with _Not applicable_ handling.
- **Data table**: TanStack Table v9 with sortable, keyboard-operable headers and URL-held state; stacks into cards on narrow screens.
- **Glossary terms**: CPC, IAO, CRAMP, provisional/reviewed/published explained inline.
- **Elevated action dialog**: justification required, clearly marked as logged.
- **Print styles** for receipts and reports.
- New shadcn primitives as needed (tabs, select, checkbox, radio group, textarea, badge, tooltip, dropdown menu, sheet, progress, alert dialog, separator, skeleton), added from the registry at the pinned CLI version.

## 8. Code organisation

```text
src/app/          router, route guards, providers, error boundaries
src/layouts/      institution, officer, supervisor, admin shells + shared chrome
src/features/     domain features (session, reporting, evidence, review, clarifications,
                  baseline, foundations, oversight, annual, forms, notifications, audit, simulation)
                  each with queries.ts (keys + options), mutations, components
src/routes/       screens per persona, thin: compose features
src/components/   shared domain components; ui/ stays generated shadcn
src/lib/          api client, dates, formatting, search-param parsers
src/mocks/        mock API (removable as a unit)
```

The current foundation demo screen is retired; its health check moves to the admin Operations area.

## 9. Delivery phases and review points

Work proceeds in phases that follow the Linear gates. **At the end of each phase I stop, run the full checks, and ask you to review and commit.** Nothing is committed by me.

| Phase | Delivers                                                                                                                                                                                                                                                                  | Linear         | Exit checks                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| 0     | MSW infrastructure, seed cast, session + demo sign-in, route guards, the four layouts with navigation, shared status/date/banner components, forbidden/expired/404 pages, retire foundation screen, update e2e.                                                           | HP2-14         | Each persona signs in to its own layout; wrong-role URLs are refused by guard and by mock API.        |
| 1     | Thin path (Gate 2): admin form editor + publish; institution home, report draft, save/recover, review-before-submit, attestation, receipt; officer queue and basic review/finalize; mock provisional scoring.                                                             | HP2-16, 21, 22 | One institution submits, officer finalizes, receipt shows no number; AT03–AT07, AT26 via UI.          |
| 2     | Safeguards (Gate 3): evidence upload with progress/retry and versions; plan, baseline approval and amendments; foundations and foundation review; full clarification loop; decision invalidation and carry-forward; reopen; inbox; notification failure queue; audit log. | HP2-24, 27     | AT08–AT10, AT17, AT21, AT25, AT27–AT31 journeys work against the mock.                                |
| 3     | Full year (Gate 4): simulation clock and all eight DEMO scenarios × four quarters; supervisor dashboards; annual readiness, batch publication, corrections; institution results; exports and print views.                                                                 | HP2-31, 32     | Annual results 88.75 / 70.00 / 96.25 shown; AT13–AT16, AT18–AT20 journeys; no numbers before release. |
| 4     | Verification (Gate 5): keyboard-only runs per role, axe checks in Playwright, responsive pass, recovery paths (expired session, failed upload, conflict, lost network), docs (`docs/frontend.md`, contract notes for backend).                                            | HP2-35         | Playwright journeys for all four personas; recorded accessibility checks; no full-WCAG claim.         |

## 10. Decisions (26 September 2026)

1. **Draft API schemas live in `packages/contracts`**, marked draft, for Patrick to adopt or revise in HP2-9.
2. **Implementation starts now**; Jamal and Samuel review the plan and each phase alongside Henry.
3. **Mocks are dev and test only.** Production builds never include MSW; there is no hosted mock-mode build.

## 11. Assumptions (PRD defaults, changeable later)

- P0 only: no CSV import, AI evidence assistant or second active scoring profile (§6.2, §18.2).
- Scores withheld from institutions until publication (O06); clarification window 7 days (§7.3); no late-penalty deduction (O04); equal milestone weights (§10.4).
- English only; laptop and narrow mobile layouts; evidence preview limited to authorized download plus metadata (§18.2 simplification) unless time allows inline preview.
- All data synthetic; `example.invalid` addresses; no real institutions.

## 12. Out of scope for this plan

Backend implementation, real authentication, file storage and malware scanning, email delivery, and performance measurement. The UI surfaces their outcomes; the mock simulates them.
