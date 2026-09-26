# Frontend verification record

Scope: `apps/web` against the mock API · Issue: HP2-35 · Recorded: 26 September 2026

This records what has been checked, what the checks found and fixed, and what has not been verified. Automated checks catch a subset of accessibility problems; **this is not a claim of full WCAG 2.2 conformance** (PRD §11).

## What runs on every change

`pnpm check` (lint, typecheck, unit tests, builds) and `pnpm test:e2e` against the development stack. The browser suites are in `e2e/`:

| Suite                                           | What it verifies                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessibility.spec`                            | axe-core with WCAG 2.0, 2.1 and 2.2 A/AA rules on about 30 screens for all four roles, in mid-year and year-end states (drafts, clarifications, tabs, charts, reports). Zero violations required.                                                                                                                                  |
| `keyboard.spec`                                 | Keyboard-only journeys: skip link moves focus to the main content; every stop shows a visible focus indicator; sign-in and report entry without a mouse; radio groups; dialog focus trap and return on Escape; account menu.                                                                                                       |
| `recovery.spec`                                 | Lost connection keeps entries and retry saves; expired session keeps unsaved entries and saving works after signing in; interrupted upload is explained and retried without a duplicate; a submit whose response is lost is retried safely (one receipt, AT06); a draft changed in another tab is refused rather than overwritten. |
| `responsive.spec`                               | Every screen at 390 px has no horizontal page scroll (wide tables scroll inside their own focusable container).                                                                                                                                                                                                                    |
| `personas`, `thin-path`, `safeguards`, `annual` | Role layouts and scope; the report-to-finalize path; clarification, re-review, baselines and email failure; the scripted year, publication and correction (AT09–AT20, AT25–AT31 journeys).                                                                                                                                         |

## Found and fixed during verification

| Finding                                                                                             | Fix                                                                              |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Inactive tab labels at 4.07:1 contrast (needs 4.5:1)                                                | Tab triggers use the `muted-foreground` token.                                   |
| Wide tables scrolled horizontally but could not be reached by keyboard                              | Table containers become a labelled, focusable region only while they overflow.   |
| The skip link did not move focus; sign-in and system pages had no skip link                         | `main` is programmatically focusable on every page; skip links added.            |
| An expired session navigated away from unsaved report and form-editor entries                       | Screens with unsaved input stay put and offer "Sign in again in a new tab".      |
| A failed upload showed a generic message                                                            | The upload control shows the specific network or timeout message.                |
| Officer institution, institution plan, simulation and assignments pages scrolled sideways at 390 px | Grids use a single constrained column; long buttons, selects and tab lists wrap. |

## Not verified

- Screen reader testing with NVDA, JAWS, VoiceOver or TalkBack. Structure (landmarks, headings, labels, live regions) is checked automatically; spoken output is not.
- Zoom to 400% and text-spacing overrides; high-contrast and forced-colours modes.
- Practitioner usability sessions (HP2-33); these checks are internal only.
- Behaviour against the real API, authentication and storage: the mock reproduces the contract in `docs/api-handover.md`, not its performance or failure modes.
- Print output was reviewed visually only; there is no automated print test.
