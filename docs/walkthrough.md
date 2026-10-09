# End-to-end walkthrough

A manual test of one quarter: the focal person reports and submits, the prevention officer reviews with the evidence assistant, and the supervisor monitors. It takes about 20 minutes. Every step and label below was checked in a dry run against the Docker stack on 7 October 2026. The supervisor's list contents (Overview, Submissions, Workload) were opened but not inspected screen by screen. For facilitated sessions with timing and observation notes, use the [rehearsal kit](usability/README.md) instead.

## Before you start

1. **Use a demo database.** Reset, the simulation clock and the scripted year work only when `DEMO_MODE=true` and the database name ends in `_demo`. With Docker, set these in `.env`, as `.env.example` does:

   ```sh
   POSTGRES_DB=cpi_demo
   DATABASE_URL=postgresql://cpi_local:cpi_local_only@127.0.0.1:15432/cpi_demo
   ```

   If the Postgres volume already exists, create the database once with `docker exec hp2js-cpi-postgres-1 createdb -U cpi_local cpi_demo`. Then run `pnpm docker:up`; the API migrates and seeds an empty database on start.

2. **Choose the assistant provider.** `ASSISTANT_PROVIDER=deterministic` runs offline with no key. To use OpenAI or Ollama, see [assistant.md](assistant.md#configuration).

3. **Start clean.** Sign in as Administrator → **Simulation clock** → **Start a new run**. The business time should read Thu 1 Oct 2026, 08:00 EAT, with Q1 open for reporting. A new run also turns the evidence assistant off.

4. **Find the files.** Upload the fictional signed minutes from `docs/demo-evidence-packs/Test Docs/Demo-001 Test Docs/02_Q1/`:
   - `DEMO-001_Q1_CPC_Minutes_Signed.pdf`
   - `DEMO-001_Q1_IAO_Committee_Minutes_Signed.pdf`

Sign in at <http://127.0.0.1:5180/sign-in?demo=open> and pick a demo account. Switch accounts the same way between sections.

| Account                | Sees                                                         |
| ---------------------- | ------------------------------------------------------------ |
| Focal person, DEMO-00N | Only their own institution                                   |
| Prevention Officer A   | DEMO-001 to DEMO-004                                         |
| Prevention Officer B   | DEMO-005 to DEMO-008                                         |
| Supervisor             | All eight institutions: reads, comments, never decides       |
| Administrator          | Setup, clock, audit log, evidence assistant on/off and usage |

## A. Administrator: set up

| Do                                                                        | Expect                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Reporting forms** → **Version 1** → **Publish version 1** → **Publish** | "No issues: this version can be published", then "this version is locked"  |
| **Run the year → Evidence assistant** → **Turn on**                       | "The evidence assistant is on", with the provider and model you configured |

## B. Focal person, DEMO-001: report and submit

| Do                                                                                                                                                  | Expect                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Start report** on Q1                                                                                                                              | The quarterly progress report form                                                                                                  |
| Under the CPC minutes question, **Upload a file**: the CPC minutes PDF                                                                              | The file listed. Under the control: "Submitted files may be read by AI to help officers review them; officers make every decision." |
| Under the IAO minutes question, upload the IAO minutes PDF                                                                                          | The file listed                                                                                                                     |
| For each milestone: **Yes, completed**, fill **Output achieved**, tick the file, and fill **Page or section in …** with the citation below          |                                                                                                                                     |
| Fill **Emerging issues across the quarter** and **Actions to address the issues**, then **Save draft**                                              | "Draft saved"                                                                                                                       |
| Reload the page                                                                                                                                     | Everything still filled in                                                                                                          |
| **Review and submit**. Tick the authorization box, give a role, choose **Approved; I have the reference**, give a reference, then **Submit report** | **Submission receipt**, "On time", and no points or scores anywhere                                                                 |

Citations, from the pack README. M-02 is cited wrongly on purpose, to test the citation check.

| Milestone | File        | Page or section                                                       |
| --------- | ----------- | --------------------------------------------------------------------- |
| M-01      | CPC minutes | `MIN. CPC/05/Q1/2026-27`                                              |
| M-02      | CPC minutes | `MIN. CPC/12/Q1/2026-27` (does not exist; the minutes end at item 09) |
| M-03      | CPC minutes | `DASA/CPC/MIN/Q1/2026-27 signature page`                              |
| M-04      | IAO minutes | `DASA/IAO/MIN/Q1/2026-27 signature page`                              |

## C. Prevention Officer A: review

| Do                                                                                                                                                                                     | Expect                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assigned work** → **DEMO-001** in "Submissions awaiting review"                                                                                                                      | The review page, with the provisional score                                                                                                                                                                    |
| Scroll to **Evidence suitability**. Under each file, the suggestions are already there if the assistant was on when DEMO-001 submitted; otherwise click **Ask the evidence assistant** | "AI-generated suggestions…" followed by suggestions, each with its quote and **Open the file at page N**. For M-02: "The location cited for M-02, “MIN. CPC/12/Q1/2026-27”, was not found in the file's text." |
| Click **Open the file at page N** on any suggestion                                                                                                                                    | The file opens at that page                                                                                                                                                                                    |
| On three suggestions: **Accept**; **Amend** (edit **Your wording**, **Save amended suggestion**); **Dismiss**                                                                          | "Accepted", "Amended" with your wording, and "Dismissed", each with your name and time. The file still says "Suitability not checked": the assistant recorded nothing for you.                                 |
| In the file's suitability checks, read the **AI suggests …** line under each check. Click **Use** on one.                                                                              | That check is filled in, and the file still says "Suitability not checked". For the CPC minutes, relevance shows **AI suggests Deficient** because of the M-02 citation.                                       |
| Under **Ask the evidence assistant**, type "Who signed the minutes?" and click **Ask**                                                                                                 | Your question, then a reply labelled "Evidence assistant (AI-generated)" that names the file and page. The supervisor later sees the conversation but no **Ask** button.                                       |
| Record the suitability checks (**All five checks pass** per file, or each check)                                                                                                       | "Suitable"                                                                                                                                                                                                     |
| Decide each milestone card: **Reject** M-02 with a reason; **Accept** M-01, M-03 and M-04; **Save decision** each time                                                                 | "Saved by Prevention Officer A". The reviewed score updates.                                                                                                                                                   |
| **My portfolio** → DEMO-001 → **Confirm correspondence with the approved plan**                                                                                                        | "SEEDED HISTORICAL BASELINE · confirmed"                                                                                                                                                                       |
| Back on the review: **Finalize review** → **Finalize**                                                                                                                                 | "Decisions are read-only"                                                                                                                                                                                      |

Optional: before finalizing, ask for a clarification on M-02. As the DEMO-001 focal person, respond with the right citation and resubmit. Back as the officer, the new revision's file gets fresh suggestions, and the earlier ones are under **Earlier suggestions**.

## D. Supervisor: monitor

| Do                                                                                            | Expect                                                                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**, then **Submissions** → **Finalized** tab                                        | DEMO-001 Q1, finalized. A review still in progress appears under **Awaiting review**.                                            |
| Open the DEMO-001 review                                                                      | The officer's decisions, and the assistant's suggestions with Accepted, Amended and Dismissed. No **Ask** or **Accept** buttons. |
| **Add a comment** → **Post comment**                                                          | The comment shows as open                                                                                                        |
| **Workload**, **Institutions**, **Evidence**                                                  | Counts per officer and institution; the evidence lookup includes the two uploaded files                                          |
| As Officer A, open the review: **Reply**, tick **Mark the comment addressed**, **Send reply** | The comment shows "Addressed"                                                                                                    |

## E. Administrator: audit

| Do                     | Expect                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Audit log**          | The submission, `assistant.run`, `assistant.decision`, review decisions, finalization and comments. Assistant entries carry IDs and outcomes, never document text. |
| **Evidence assistant** | Usage: runs, suggestions shown, and the accepted, amended and dismissed counts                                                                                     |

## F. Access boundaries

| Do                                                    | Expect                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| As Focal person, DEMO-002                             | Only DEMO-002 anywhere. No DEMO-001 data, no AI suggestions, no unpublished scores. |
| As Prevention Officer B, open the DEMO-001 review URL | "…not available to you"                                                             |

## Faster: the scripted year

**Simulation clock → Run the scripted year** submits and reviews a whole year for all eight institutions, using each pack's signed minutes and citations. Then turn the assistant on and try:

- DEMO-001 Q1 as Officer A;
- DEMO-007 Q2 as Officer B. Revision 1 holds the wrong-period minutes (FY 2025/26), which the assistant flags as dated outside Q2.

**Start a new run** resets everything.

## Automated

`pnpm test:e2e` runs the Playwright journeys against the running stack, including `e2e/thin-path.spec.ts` (submit, review, finalize) and `e2e/assistant.spec.ts`. Leave `RESEND_API_KEY` empty for the run; the sign-in tests read codes from the local email sink.
