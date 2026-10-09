# Hackathon workflow rehearsal kit

[HP2-33](https://linear.app/hp2js/issue/HP2-33) · PRD §4.2 · AT23, AT26, AT29–30.

**Team role-play is the hackathon validation approach.** External practitioners will not be available within the hackathon. Recruitment is outside this delivery scope and does not block completion of HP2-33 or demo readiness. No session has yet been run. Automated acceptance evidence is tracked in HP2-36; practitioner feedback would be separate work before a real-world pilot.

Start with [the team rehearsal](team-rehearsal.md).

## Participants and responsibilities

Henry acts as the reporting user; Patrick as the reviewer; Jamal facilitates and reviews usability findings; Samuel records observations with Jamal; Jason prepares synthetic examples with Henry. Record actual attendance and substitutions.

Use role/session labels in the records. Team familiarity with the app limits what this exercise proves: describe it as internal workflow rehearsal, not practitioner validation.

## Materials

- [Task cards](task-cards.md): show only the relevant participant-facing prompt during a task.
- [Session record](session-template.md): copy once per session; leave unobserved fields blank or explicitly not tested.
- [Findings and retests](findings-template.md): create one record per distinct problem and link its Linear issue.
- [Setup](../../README.md): use the existing development runbook and synthetic accounts.
- [PRD](../HP2JS%20%E2%80%94%20Adili-V3-Track-2-PRD.md): source for the workflow and validation criteria.

## Before the session

1. Use an isolated local demo instance with synthetic data. Confirm no other session uses it before resetting. Resets only run on the dedicated demo database (its name ends in `_demo`, HP2-42); do not use a shared or production database.
2. Record commit/build, browser, viewport, run ID, business time, institution, quarter and fixture state. Have an accessible input method available; do not assume every participant uses a mouse.
3. Prepare one clean reporting fixture and a separate annual-results fixture. Use the app's existing simulation tools and runbook; do not reset between linked reporting/clarification tasks. Never run the scripted year in the middle of a participant's unfinished report.
4. In the reporting fixture, publish the reporting form, open Q1, confirm the labelled historical baseline with the assigned officer and verify the participant's account opens only its own institution. Prepare a draft that can honestly declare missing signed IAO minutes and missing institutional approval. Verify the workflow with a facilitator account before inviting participants to begin.
5. For clarification, prepare a submitted revision with a targeted request and a response window extending past cutoff. Record the actual displayed dates; explain the business clock as simulated time. Use a response that replaces a shared evidence file and a separate unchanged criterion for carry-forward.
6. For annual explanation, use the scripted DEMO-004 worked result of 96.25 with a published and an unpublished state available in sequence. This is the §3.3 numerical story; the illustrative PRD narrative names DEMO-001, while the executable full-year scenario assigns that result to DEMO-004. Do not confuse it with DEMO-001's 88.75 annual example.
7. Inspect every synthetic document intended for human review. It must actually contain the passages claimed in the task. HP2-49 tracks readable seed evidence. Placeholder bytes or a scripted pass decision cannot validate human evidence review. If adequate files are unavailable, label that task blocked; a paper storyboard can support discussion only, not a completed app task.

Prepare both a deficient document and its corrected successor, labelled fictional. Their contents should make institution, quarter, signature/approval presence, legibility and the exception-review claim assessable. Keep a fixture inventory in the session record. Do not invent or certify real institutional signatures.

## Facilitation

Plan approximately 35–45 minutes per participant as an internal session budget, not an event rule. Allow 5 minutes for introduction, 5 for current practice, 20–25 for tasks and 5–10 for explanation/debrief. Stop earlier on request.

Read: “We are evaluating the prototype, not you. Please use only the fictional records supplied. Say what you are looking for and what you expect to happen. You may skip a task or stop at any time. We will take notes using a participant code. We will not record audio or video unless you separately agree.” Record agreement before starting; consent to participate does not imply consent to recording.

Ask about current practice without requesting real case details: who prepares, approves and submits; how the approved plan reaches the reporting person; what supports a review decision; how missing evidence is handled; and whether the proposed response window fits actual work. Record disagreement as domain feedback for HP2-5, not an immediate policy change.

Present one task at a time, without the expected result. Start timing when the participant begins; stop at completion, abandonment or facilitator rescue. Record pauses separately. A neutral “What would you expect here?” is allowed, but record it. Naming a control, explaining a status or performing an action is assistance. Preserve the first attempt outcome before showing a recovery path.

For a product failure, capture the synthetic record IDs, visible error and reproduction steps. Stop on cross-institution access or silent data loss. Do not continue counting dependent tasks as successes; restore a separate known fixture and label the restart. Avoid inspecting real records to investigate.

## Completion and acceptance

Use these outcomes: completed unaided; completed with assistance; blocked by product; blocked by fixture; abandoned; not tested. Record elapsed time, assistance, observed confusion and the participant's explanation separately. Successful clicking alone does not demonstrate understanding.

For hackathon completion, each core task must be completed without facilitator rescue by the team member acting in its relevant role, and each participant must distinguish:

- Submission/receipt from officer acceptance.
- Provisional/reviewed calculation from a published result.
- Evidence presence from supported achievement.

Wrong-institution access, silent data loss, a misunderstood deadline or inability to explain an awarded point blocks acceptance until fixed and retested. Repeated confusion from two participants triggers workflow/design review, even if both eventually complete the task. Keep the original observation and retest outcome; do not overwrite a failed first attempt.

Assign findings by outcome: interface/navigation to Jamal; API/data/access to Patrick; domain interpretation and validation to Henry. Samuel and Jason contribute evidence and analysis under those workstreams. Link the appropriate existing Linear issue before creating a duplicate. Track assignments/status in Linear and observations in the session/findings records.

Summarize tasks attempted, unaided completions, assisted outcomes, blocked/not-tested tasks and unresolved findings. Keep the evidence labelled internal team role-play. Do not generalize team timing into practitioner efficiency claims. External recruitment and practitioner approval are not hackathon completion criteria.
