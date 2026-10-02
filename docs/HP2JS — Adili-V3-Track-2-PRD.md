# **HP2JS — Adili V3 Corruption Prevention Indicator Automation**

Product requirements document

Version 1.1 | 24 September 2026 | Prepared for team review

Product lead: Henry Ohanga

Team: 

* Henry Ohanga  
* Patrick Mwangi  
* Jamal Guyo  
* Jason Ndirangu and   
* Samuel Okello

This document defines a prototype for institutions to report corruption prevention work and for EACC officers to evaluate it through a complete annual cycle. It brings the challenge requirements, published guidance and our product decisions into one reviewable specification.

The central design is a traceable chain from an institutional plan to quarterly claims, supporting evidence, officer decisions and a published annual result. The document includes 16 functional requirement groups, 32 acceptance scenarios, a proposed scoring rubric and a register of 17 decisions for the team and organizers.

The first review should settle the scoring assumptions, confirm the MVP boundary and allocate the unanswered decisions. Published requirements and proposed prototype rules are distinguished throughout.

# **Contents**

[1 Product purpose and the decision before the team](#bookmark=id.nuzw45twu1lk)

[2 Evidence basis and requirement authority](#bookmark=id.gspj0k4o905j)

[3 The problem in operational terms](#bookmark=id.1h24c36i3vxp)

[4 Goals and measurable success](#bookmark=id.3ya4vatok861)

[5 Users and permission boundaries](#bookmark=id.56hgr1jkcce)

[6 Scope and release boundaries](#bookmark=id.zbdvmnv8o6v2)

[7 End to end workflow and state rules](#bookmark=id.yimvl54g05d3)

[8 Functional requirements and acceptance criteria](#bookmark=id.60qaxelycs8q)

[9 Calendar and evidence policies](#bookmark=id.uy7gzc537g2n)

[10 Scoring specification for team review](#bookmark=id.7xjclyy8u588)

[11 User experience requirements](#bookmark=id.iqw3d0hbjwsf)

[12 Data model and information contracts](#bookmark=id.vmjejz6ej0n4)

[13 Security privacy and operational quality](#bookmark=id.arxtwyc3fdk5)

[14 Innovation and AI boundaries](#bookmark=id.p24j7yoztgt3)

[15 Proposed architecture and implementation boundaries](#bookmark=id.w8olz8eomhte)

[16 Verification and acceptance scenarios](#bookmark=id.tla6hjh1j0y6)

[17 Demonstration and judging evidence](#bookmark=id.u3w7v08yvy07)

[18 Team ownership and delivery gates](#bookmark=id.21pvh2kjtjnp)

[19 Decision register and organizer questions](#bookmark=id.uxfh9c1nz0j2)

[20 Risks and review checklist](#bookmark=id.9tny61n2z751)

[21 Source register and traceability](#bookmark=id.qzxei5yyqecw)

[22 Glossary](#bookmark=id.bjl8sg8hwjt7)

# **1 Product purpose and the decision before the team**

Public institutions need to demonstrate that they have identified corruption risks, planned responses, and implemented prevention measures. EACC prevention officers need to examine those claims, provide feedback, and evaluate performance. Today, the process described in the challenge materials depends on emailed quarterly reports and evidence, officer analysis, advisories, and an annual score. Documents and decisions can become disconnected, making it difficult to establish what was submitted, what remains unresolved, and why a score was awarded. \[S02, S03, S07, S08\]

Our selected challenge is Track 2, Corruption Prevention Indicator Automation. We will build a working prototype that connects reporting requirements to institutional responses, supporting evidence, officer decisions, and reproducible scores across a full simulated financial year. A reader should be able to follow any awarded point back to its criterion, submission version, evidence and reviewer decision.

The core product promise is simple: an institution knows what to submit and what needs attention; an officer can review it consistently; a supervisor can see coverage and unresolved work; and an authorized administrator can release an annual result that can be explained and reproduced.

This PRD establishes the proposed product baseline for team review. It defines the problem, scope, users, workflows, business rules, acceptance tests, delivery ownership and decisions requiring organizer clarification. It does not authorize production use, establish official EACC scoring policy, or claim that submission compliance proves an institution is free of corruption.

The team is asked to review the proposed scoring model, the MVP boundary, the role permissions and acceptance scenarios before converting requirements into implementation tasks. Requirements labelled proposed provide a concrete implementation default. They remain open to revision through the decision register in Section 19\.

## **1.1 What success looks like**

The demonstration starts with an administrator publishing a configurable compliance form. Eight fictional institutions can submit quarterly responses and evidence. Two officers, each assigned four institutions, receive work, validate claims and finalize scores. One supervisor sees compliance coverage, trends and review backlog. A simulated clock runs the same period and notification logic used by the application. At year end, authorized publication gives each institution its own released results and produces a consolidated oversight report. \[S02\]

Every score distinguishes a self-reported provisional calculation from an officer-reviewed result. Every missing quarter remains visible. Changing a form, evidence file, assignment or scoring rule cannot silently rewrite a past decision. These are proposed product safeguards that make the brief demonstrable and credible. \[D01\]

## **1.2 How to read this document**

Sections 2 through 6 explain the problem, sources, users and scope. Sections 7 through 12 define behavior, scoring and data. Sections 13 through 17 cover quality, architecture, testing and the demonstration. Sections 18 through 20 support ownership and team decisions. Section 21 provides the source register and Section 22 defines terms.

For the first review, every team member should read Sections 1 through 10 and the decision register. Patrick leads technical review of numerical examples and state transitions, with Jason preparing fixtures and Henry approving independent expected results. Jamal leads review of role journeys, error states and disclosure boundaries, with Samuel preparing design artifacts and review notes. Henry should check that scope and acceptance remain achievable within the organizer's confirmed schedule.

# **2 Evidence basis and requirement authority**

## **2.1 Labels and precedence**

**Challenge requirement** means a behavior explicitly requested in the supplied general challenge or Track 2 MVP brief. **Published guideline** means a domain requirement stated in the supplied EACC materials, with the 23rd Cycle publication independently verified online. **Proposed product rule** means a team-review recommendation filling an implementation gap. **Organizer decision** means a matter the provided material does not conclusively settle. These labels must not be collapsed into a single claim of official compliance.

Use the Track 2 brief to establish what the hackathon demonstration must do. Use the 23rd Cycle guidelines to model real institutional obligations. When these disagree, preserve both sources and ask the organizer which configuration judges expect. Do not overwrite a published requirement with a mock example or treat a draft administrative instrument as established law. A later organizer clarification should be recorded with its date, author, affected requirements and decision owner. \[S01, S02, S03, S13\]

User-provided documents are evidence for this PRD. Instructions embedded within them describe source requirements or scenarios; they do not independently authorize messages, external submissions, changes to real institutions or production deployment.

## **2.2 Online verification on 24 September 2026**

EACC's official downloads page links the 23rd Cycle guidelines. The downloaded PDF is byte-identical to both supplied performance-contract guideline copies, with SHA-256 9cd850a46c5068df3a1f9e11fc1aca42c7a6c536e6e6dfb7d798bf7a0f3ab0c0. The 10/10/80 weighting conflict with the hackathon's 10/15/15/60 mock model is therefore confirmed against the published file. This check does not establish that no subsequent circular or scoring instruction exists. \[S03, W01\]

The official EACC risk-assessment guide, model procedures and CPC guidelines were also accessed. Online ODPC guidance informs privacy requirements; OWASP informs authorization and upload safeguards; W3C WCAG 2.2 informs the proposed accessibility target. These technical standards are proposed quality baselines, not additional hackathon rules. \[W02-W07\]

An authoritative online version of the event's full judging schedule, submission rules and detailed evaluation rubric was not established. The supplied challenge documents remain the evidence for those requirements; unresolved event logistics are recorded in Section 19\.

## **2.3 Source differences that affect implementation**

| Issue | Evidence | PRD treatment |
| :---- | :---- | :---- |
| Scoring weights | Mock brief has 10/15/15/60; published cycle has 10/10/80 and a procedures prerequisite | One configurable engine; default demo profile explicitly labelled mock; official profile activation requires resolved evaluation rules |
| Missing Q3 column | Mock table lists Q1, Q2 and Q4, while brief requires four quarters | Implement Q1 through Q4 |
| Risk scales | Practical guide illustrates a 3 by 3 matrix; cycle reporting template uses 1 to 5 inputs | Capture 5 by 5 scale for this cycle; store scale version; do not infer severity bands |
| Annual formula and late penalty | Aggregation required; detailed method and penalty amount absent | Use explicitly proposed demonstration rules; show late status separately |
| Review cadence | Systems-review material describes semiannual follow-up; PC brief requires quarterly reporting | Keep quarterly PC workflow distinct from later systems-review workflows |
| Institution directory | Supplied list is 22nd Cycle FY2025/2026 | Reference taxonomy only; seed fictional institutions, not an asserted current roster |
| Draft administrative mechanisms | Filename says final draft; notice number is unfilled | Context for adjacent tracks only |
| Similar procedure PDFs | Generic EACC model and scanned college adaptation are different | Generic model is guidance; adaptation is an example, not a national rule |

# **3 The problem in operational terms**

## **3.1 Current process**

The prevention presentation describes an annual cycle of guidelines, quarterly institutional reports, analysis and advisories, followed by annual evaluation. Officers are assigned MDAs; supervisors oversee officers; results are shared with institutions and the Public Service Performance Management Unit. The presentation describes more than 500 participating MDAs, while the challenge reduces the prototype to eight. This is source context, not a measured capacity claim for our product. \[S07\]

Within an institution, Integrity Assurance Officers support corruption risk assessment and prepare progress information. The Corruption Prevention Committee oversees prevention work and quarterly reporting. The Accounting Officer chairs the relevant CPC arrangements. Signed committee minutes are central evidence under the supplied cycle guidance. A focal person can operate the prototype on behalf of the institution; this does not transfer the institution's approval duties to that user. \[S03, S06\]

## **3.2 Pain points and consequences**

Scattered submissions make it hard to identify the latest evidence and prove receipt. Repeated follow-ups consume reviewer time. Without an explicit rule and decision record, similar claims can receive inconsistent treatment. Supervisors need to distinguish an institution that has not reported from one whose officer has not finished review. Institutions need understandable corrective feedback before an annual result is released. The review/advisory workflow explicitly identifies lost documents, lack of feedback and accountability, and tedious manual review. \[S07, S08\]

The proposed product addresses these problems through a shared submission record, stable versions, a visible work queue, structured feedback and traceable evaluation. The prototype will not establish a causal reduction in corruption. It will demonstrate a more accountable way to administer prevention reporting and evaluation.

## **3.3 Illustrative institutional story**

A fictional service agency identifies discretionary allocation of appointments as a corruption risk. Its approved mitigation plan includes introducing an allocation register, training staff and reviewing exception reports. The focal person reports each quarter against those planned activities, records outputs and challenges, and links the required committee minutes. A prevention officer finds that the minutes support training but do not substantiate the claimed exception review. The officer requests clarification and later finalizes the supported achievement with a reason. The supervisor sees the unresolved item until review is complete. At year end, the institution receives a published score and the explanation behind it.

Worked case: DEMO-001 uses risk R-01, discretionary appointment allocation, and activity A-01, establish a controlled allocation register. Its Q1 milestone M-01 requires the register to be operational and an exception review completed by quarter end. The locked Q1 baseline contains M-01, staff training M-02, the CPC meeting M-03 and the IAO meeting M-04, each with weight 1\. The institution claims all four completed and references the signed committee minutes and relevant passages in its progress report. Supplied evidence gives a provisional I1 of 4/4, but does not establish that each claim is true.

The officer finds support for training and both committee meetings, but no support for the exception review required by M-01. A clarification identifies that missing fact. If the response window expires without support and the applicable evaluation cutoff has passed, the officer records M-01 \= 0 with a reason, accepts the other three, and finalizes I1 \= 3/4 \= 0.75. Q1 then contributes 60 × 0.75 ÷ 4 \= 11.25 annual implementation points. With full foundations and I2 \= I3 \= I4 \= 1, the annual result is 40 \+ 60 × (0.75 \+ 1 \+ 1 \+ 1\) ÷ 4 \= 96.25. The entity sees the score only after publication.

The trace is R-01 → A-01 → M-01 → Q1 submission revision → evidence version and passage → rejected criterion decision → Q1 fraction → annual publication version. A timely clarification proving the review occurred on time triggers re-review and a recalculation; it never silently overwrites the original decision. This case is a separate calculation variant from annual Example A in Section 10.6. All records are fictional; document acceptance alone does not establish real-world control effectiveness.

# **4 Goals and measurable success**

## **4.1 Product goals**

G1: Complete the reporting and evaluation cycle with clear responsibility at every step. G2: Make scoring reproducible and distinguish claims from reviewed results. G3: Reduce avoidable administrative effort by reusing stable institutional information, carrying evidence references forward and automating notifications. G4: Give supervisors an accurate view of both compliance and review coverage. G5: Provide an architecture that can grow beyond eight institutions without weakening access controls. \[S02, D01\]

## **4.2 Proposed acceptance measures**

These are demonstration targets, not measured benefits or organizer thresholds.

| Measure | Target and measurement |
| :---- | :---- |
| Scenario coverage | Eight institutions, two officers, one supervisor, one administrator; 32 institution-quarter status records |
| Calculation correctness | All approved scoring fixtures reproduce exactly at stored precision and match displayed rounding |
| Authorization | All negative tests in Section 16 pass through APIs and evidence downloads, not only navigation |
| Audit coverage | Every publish, submit, review, finalize, reassignment and release action has actor, time, object version and outcome |
| Workflow completeness | At least one clarification and revision cycle, late submission, missing quarter and score adjustment are demonstrated |
| Notification reliability | Replayed event creates no duplicate visible notification; failed delivery is visible and retryable |
| Usability | Each role completes its core task with understandable next actions; record observed errors in team testing |
| Performance | On a documented test setup, ordinary reads and writes have p95 under 2 seconds at 20 concurrent users; exclude upload transfer and external providers |
| Scale rehearsal | Optional 500-institution synthetic dataset supports filtered lists and dashboards; report measured results, not assumed capacity |

Collect submission-to-finalization duration, clarification rounds and user task time during testing. A claimed percentage reduction in work requires a documented manual baseline using the same task and data. Until measured, describe expected benefits as hypotheses.

User-validation plan, proposed: Henry recruits at least two institutional reporting practitioners and two prevention/review practitioners, subject to availability and their consent to participate. Henry owns the validation plan and findings; Jamal leads interface and usability review with Samuel preparing session materials, recording observations and assisting facilitation. Jason prepares score examples and evidence for Henry's acceptance review; Patrick investigates persistence/access defects. No participants are assumed to be confirmed. If only team role-play is available, label it internal rehearsal and retain external workflow validation as an unmet pilot gate.

Before detailed implementation, use a walkthrough to check who prepares, authorizes and submits reports, how approved plans are obtained, what evidence officers can reasonably evaluate, and whether clarification windows fit actual work. After the thin working path, ask participants to submit an honest deficiency, locate their receipt, answer a targeted clarification, review changed evidence and explain a published score. Use synthetic data and record task completion, time, assistance, misunderstandings and requested changes without collecting unnecessary personal information.

Proposed exit criteria: every core task is completed without facilitator rescue by at least one practitioner from its relevant role, and every participant can distinguish submission from acceptance, provisional from published results, and evidence presence from verified achievement. Any wrong institution access, silent data loss, misunderstood deadline, or inability to explain an awarded point blocks acceptance until fixed and retested. Repeated confusion from two participants triggers a workflow/design revision. Henry maintains findings, owner, severity, decision and retest outcome. Small-sample results support usability refinement, not population-wide efficiency claims; domain disagreement goes to the organizer decision register.

## **4.3 Dashboard metric definitions**

All metrics are filtered by cycle and authorized institution scope. Future obligations are excluded from due-report rates. Display the numerator, denominator and as-of time beside each aggregate; show not applicable for a zero denominator rather than 100 percent.

| Metric | Proposed definition |
| :---- | :---- |
| Submission coverage | Due institution-quarter obligations with a received submission divided by all due obligations |
| On-time reporting | Due obligations with a first submitted revision at or before deadline divided by all due obligations; show evidence completeness separately |
| Evidence completeness | Submitted current revisions with every required evidence item supplied or validly exempted divided by all submitted current revisions; no exemptions configured in v1 |
| Review coverage | Submitted current revisions with a final officer decision divided by all submitted current revisions |
| Review backlog | Submitted obligations awaiting final decision, split into officer action and institution clarification action |
| Average reviewed achievement | Arithmetic mean of comparable finalized scores; identify profile, period and included institutions; never substitute zero for pending |
| Annual release coverage | Institutions with a current published annual result divided by all eight expected institutions |

Track review age from the current submission receipt and total case age from the first submission separately. A clarification response must not make a long-running case appear newly opened. After a score is reopened, it re-enters pending review coverage until finalized again. A closed nonresponse obligation is shown in a separate disposition count, not included as a submitted report.

# **5 Users and permission boundaries**

## **5.1 Primary users**

**Institution focal person:** understands reporting obligations, prepares responses, attaches evidence, receives acknowledgments and answers clarifications. Needs draft recovery, clear deadlines and an explanation of what is missing. The demo starts with one account per institution; the data model allows several users without inventing additional business roles.

**Prevention officer:** reviews only assigned institutions, checks evidence, requests clarification and finalizes quarterly scores. Needs an assignment-based queue, criterion-by-criterion comparison of claims and evidence, and an explicit reason when changing a provisional result.

**Supervisor:** monitors both officers, all eight institutions, trends, missing reports and overdue review work. The brief does not require supervisor score approval. The MVP must not silently add a mandatory approval stage that blocks finalization. \[S02\]

**Administrator:** manages users, institutions, assignments, reporting cycles, forms and publication. The brief grants full system privileges. Proposed safeguards require explicit, logged elevated actions when the administrator performs an operational override; ordinary use follows the officer review path. \[S02, D01\]

## **5.2 Proposed permission matrix**

| Action | Entity | Officer | Supervisor | Administrator |
| :---- | :---- | :---- | :---- | :---- |
| Maintain institutional responses | Own institution | Read submitted only | Read submitted only | Elevated support action |
| Read unpublished drafts | Own institution | No | No | Logged support access only |
| Read submitted evidence | Own institution | Assigned only | All eight | All, access logged |
| Request clarification | No | Assigned only | Oversight comment only | Logged override |
| Finalize a score | No | Assigned only | No | Logged override |
| Manage forms and rules | No | Read active version | Read active version | Yes |
| Manage assignments | No | Read own | Read all | Yes |
| View internal scores | No before release | Assigned only | All | All |
| Compare institutions | No | Assigned portfolio | All | All |
| Publish annual results | No | No | Read readiness | Yes, proposed default |
| View published result | Own only | Assigned only | All | All |
| Operate simulation | No | No | Read simulated date | Demo administrator only |

Authentication, institution ownership, current assignment and publication state must all be evaluated server-side. A hidden button is not an authorization. Apply the same boundaries to search, exports, notification links, cached responses and file downloads. Deny requests where the scope cannot be established. These controls follow OWASP's request-level authorization guidance. \[W05\]

Officer reassignment takes effect for future access immediately. Previous reviewer names remain in history. Deactivation revokes sessions and active permissions without deleting prior decisions. A correction to an old decision is made by the currently authorized reviewer or an explicitly logged administrator override.

# **6 Scope and release boundaries**

## **6.1 P0 required demonstration**

P0 includes user and institution setup; officer assignments; a constrained dynamic form editor; publishing and version locking; quarterly drafts and submissions; safe evidence uploads; acknowledgments; automatic provisional scoring; officer review, clarification and finalization; supervisor dashboards; notification events; four-quarter time simulation; annual evaluation; controlled publication; report export; and an audit history. \[S02, D01\]

Include a small structured plan baseline containing risk, mitigation activity, owner, KPI, target and reporting milestone. This is sufficient to connect scores to planned work. A full risk-assessment authoring application is not required. Existing approved plans can be uploaded and represented by manually entered or seeded activity rows, with officer confirmation that rows correspond to the source plan.

The dynamic editor must add or edit questions, allowed response types, evidence requirements and indicator weights before publication. It can be a structured editor with a preview; a visual drag-and-drop designer is not required.

## **6.2 P1 enhancements after P0 passes**

P1 candidates are evidence extraction assistance, CSV import with validation preview, richer advisory follow-up, additional notification channels and larger synthetic load rehearsal. Prioritize only after the end-to-end cycle and calculation tests pass. Human-reviewed AI assistance is described in Section 14 and is optional unless the organizer confirms a requirement.

## **6.3 Later production work**

Production readiness includes verified official scoring policy, government identity and integration agreements, deployment and data-processing approval, operational monitoring, backup recovery validation, retention schedules, security review and user support. It also includes formal correction or appeal procedures if required by the responsible authority. These are explicit transition gates, not claims that a hackathon deployment is production-ready.

## **6.4 Out of scope**

The MVP excludes individual income, asset and liability declarations; gifts and COI registers; complaints and investigations; automatic legal findings; automatic penalties without an approved rule; a public corruption ranking; live PSPMU or EACC integrations; and an entire institutional document-management suite. The COI resources inform future interoperability and scope boundaries, not additional Track 2 screens. \[S10-S14\]

# **7 End to end workflow and state rules**

## **7.1 Cycle setup and publishing**

The administrator creates a financial year, four reporting periods, submission deadlines, an evaluation cutoff and a scoring profile. The administrator assigns eight institutions to the two officers and configures a form. Validation checks that weights total 100, questions have stable identifiers, evidence policies are defined, and all quarters exist. Publishing creates an immutable version and queues notifications for institutional users and prevention officers. Supervisor status updates show publication coverage. \[S02\]

The demo profile is named Hackathon Mock v1. It must be visibly identified as a simulation profile on internal score screens and exported results. Publishing a new version does not migrate existing responses automatically. For the MVP, wording and non-scoring form amendments affect an unopened future period; an active period retains its assigned version. The scoring profile, criterion meaning and weights are locked for the entire cycle once its first form is published. A different scoring experiment uses a separate labelled simulation run. An organizer-mandated midcycle scoring change requires a new approved cycle-wide profile, impact review and explicit recalculation of all affected periods; it is not an ordinary form edit or a P0 self-service capability.

## **7.2 Institutional preparation and submission**

The entity dashboard shows period, reporting deadline, prerequisites, response status and next action. The focal person saves a draft, links the active plan, reports achievements, and uploads evidence. A completion check separates unanswered questions from honest declarations that evidence or achievement is unavailable. A known deficiency must not be disguised as a technical upload error.

Submission requires all questions to be answered, including explicit missing-evidence declarations where applicable. It does not require a false assertion of full compliance. The server commits a stable submission revision, computes the provisional score or records Pending baseline approval under FR04, issues a receipt and records notification events together. The receipt identifies the institution, period, revision, server receipt time, timeliness and supplied evidence inventory. \[S02, S03; proposed implementation\]

Proposed submission authority control: each submission records the authenticated submitter, institutional role or delegation reference, and an attestation that the person is authorized to submit on the institution's behalf. Capture the applicable institutional approval or minutes reference, or an explicit approval-not-available declaration. Missing supporting approval remains a review deficiency; it must not force a false statement or prevent honest reporting. Missing authority attestation blocks formal submission, while the draft remains saved. An attestation is not proof of authority and does not replace institutional governance. No additional approver role is introduced in P0.

Drafts are editable; submitted revisions are immutable. A revised response creates a new revision, preserving the earlier content and timestamps. The original submission time and first complete-evidence time are separate fields so an empty early response cannot conceal a late completion.

## **7.3 Review and clarification**

An assigned officer sees the submission, rule version, provisional calculation and evidence beside each criterion. The officer accepts or rejects discrete checklist items and milestone credit, with a reason for rejection or adjustment. A clarification identifies the criterion, question, requested evidence and response deadline. Its status is visible to the institution, while numerical internal scores remain withheld until publication under the proposed visibility rule.

The institution replies and submits a new revision. The previous provisional calculation remains in history. A new calculation uses the applicable locked profile. The officer must finalize against the latest submitted revision; attempting to finalize an older revision after a new one arrives returns a version-conflict response rather than overwriting the newer work.

Decision dependency rule: each criterion decision references the answer revision, evidence versions, plan milestone and rule version it assessed. A changed answer, replaced or withdrawn supporting file, or changed dependency marks every affected decision Needs re-review and invalidates dependent draft totals. If one file supports several criteria, all dependent decisions are affected. A comment-only change does not invalidate unrelated decisions. Unchanged decisions may be carried forward only after the officer explicitly confirms them against the latest revision; record their originating decision IDs and that confirmation. Finalization is blocked until affected decisions are reviewed and retained decisions confirmed. Previously published results remain historical releases; corrections follow Section 7.4.

The supervisor sees unresolved clarifications, review age and officer workload. Supervisor comments support oversight but do not constitute an additional score approval gate. \[S02, S07, D01\]

Proposed clarification timing: allow seven calendar days from the later of portal availability and successful in-app notification, ending at 23:59:59 Africa/Nairobi on the seventh calendar day after that event's local date. Email failure alone does not restart the clock. This response window concerns evidence and explanations, not extra time to perform the underlying milestone. If it extends beyond the cycle evaluation cutoff, block adverse closure of the affected criteria and flag Extension decision required. The administrator must record an authorized institution-specific evaluation extension or leave the result pending; the system never shortens the response window automatically. Preserve the original cutoff, extended deadline, reason, authorizer and notifications. Organizer authority for live extensions remains unconfirmed under O04 and O10.

A timely response awaits officer review even after its deadline. Officer delay is shown as a review backlog and cannot become institutional nonresponse. An unanswered clarification can be closed only after both its response deadline and the applicable evaluation cutoff have passed, with criterion-specific reasons. An extension allows evidence and review to finish; it does not extend the original cutoff for foundation achievement, erase original reporting lateness, change milestone completion dates or alter other institutions' deadlines. Institution publication waits until the extended window has ended and all decisions are final.

## **7.4 Finalization and correction**

Finalization records the accepted criterion results, score explanation, evidence references, reviewer and timestamp. The institution's workflow status can say review complete without revealing the score. An ordinary finalized record cannot be edited in place.

Before annual publication, the current assigned officer can reopen a finalized result with a required reason. This creates a new decision version and marks the annual evaluation stale. After publication, an administrator must open a correction case with a reason, an officer must record the corrected decision, and the administrator must publish a new result version. The earlier published result remains accessible as superseded. This is a proposed correction mechanism, not a statutory appeal process.

## **7.5 Submission states**

| State | Meaning | Allowed next action |
| :---- | :---- | :---- |
| Not started | Reporting obligation exists; no draft | Entity starts draft |
| Draft | Entity is preparing a response | Entity saves or submits |
| Submitted | Receipt and provisional result recorded | Officer starts review |
| Under review | Officer is evaluating current revision | Clarify or finalize |
| Clarification requested | Institution owes a response | Entity submits revision; officer closes with reason at cutoff |
| Finalized | Officer decision recorded | Controlled reopen or annual evaluation |
| Closed without submission | Officer records nonresponse after cutoff | Controlled correction only |

Late, evidence incomplete, not yet due and clarification overdue are separate flags. They are not substitutes for workflow state. A late report can be under review; an on-time report can have inadequate evidence. Finalized zero and not yet reviewed must never be indistinguishable.

## **7.6 Annual evaluation and release**

The evaluation engine reads locked quarterly decisions and the annual foundation decisions defined in Section 10\. A draft annual report lists all eight institutions and every quarter, including unresolved records. An institution's score is releasable only when its four quarter obligations have final dispositions and all foundation criteria have decisions. At the applicable cutoff, officers can record an explicit zero disposition for nonresponse or unresolved unsupported claims, with a reason, only after any protected clarification response window in Section 7.3 has expired. The reviewer backlog remains pending. The scheduler never makes that substantive judgment.

Proposed release policy: the administrator publishes ready institutions in an identified batch after the financial year, Q4 deadline and applicable evaluation cutoff, including any authorized institution-specific extension, have passed. The consolidated report may show remaining institutions as not released with reasons; it must not imply the batch represents completed evaluation of all institutions. The final demo resolves all eight. Publication notifies each institution of its own result and exposes its own explanation and report, not another institution's evidence.

# **8 Functional requirements and acceptance criteria**

## **FR01 Identity and assignments**

Priority P0. Challenge basis S02; authorization details proposed. Administrator creates or seeds accounts, assigns entity membership and officer portfolios, and deactivates users. Institution identifiers are stable even if a display name changes. The initial allocation is four institutions per officer; allocation is configurable and not hard-coded.

Acceptance: an entity user cannot read a second institution through a changed URL, API parameter, export or evidence link. Officer A cannot review Officer B's institution. A reassignment changes access while preserving reviewer history. A deactivated account cannot reuse its session.

## **FR02 Cycle and deadline configuration**

Priority P0. Sources S02 and S03; calendar defaults proposed. Configure financial year, reporting window, submission due time, evaluation cutoff, timezone and reminder schedule. Separate the Q1 foundation deadline from the quarterly reporting deadline. Do not encode deadlines solely in the browser.

Acceptance: a submission one second after the stored deadline is late; one at the deadline is on time. Changing the simulated clock triggers the same calendar transitions as a scheduled worker. An administrator cannot retroactively remove lateness by silently changing the deadline.

## **FR03 Dynamic form and rule publication**

Priority P0. Source S02. Support text, number, date, yes/no, controlled choice, evidence reference and repeated activity rows. Configure required answers, help text, evidence category and checklist items. Scoring uses approved rule types, never arbitrary executable code entered through the form editor.

Acceptance: a new administrator-created question appears to an institution without a code change. Invalid total weights, duplicate criterion identifiers and missing period assignment block publication. A published version remains unchanged after a future draft is edited.

The editor must distinguish informational questions from scored criteria. Adding an informational question to a future form cannot change a score denominator. Editing a scored criterion or its weight after cycle activation is rejected and points to the controlled profile-change policy in Section 7.1.

## **FR04 Plan baseline and prerequisites**

Priority P0, constrained scope. Sources S03-S05; approval workflow proposed. Capture an approved-plan reference and a small structured list of planned milestones. Each row has a risk, strategy, activity, output, KPI, target, owner, resource reference and due quarter. The officer confirms that the scoring baseline corresponds to the approved plan before baseline activation and before the quarter opens. An unapproved baseline blocks implementation scoring, but does not prevent an institution from submitting a report with baseline pending status. The receipt persists; the implementation result and dependent total are Pending baseline approval, not zero or a guessed score. Approved foundation components may still be shown internally. Section 10.4 defines the labelled simulation-only historical-baseline exception. Procedure readiness is separately visible.

Acceptance: a response cannot gain implementation credit for an activity absent from the locked baseline. Removing or rescheduling a missed milestone requires a versioned amendment with reason and cannot change a prior quarter. A prerequisite deficiency is flagged, not silently interpreted as a new numerical penalty.

## **FR05 Drafts and quarterly responses**

Priority P0. Sources S02 and S03. Autosave or explicit save gives a visible saved state. Capture output achieved, emerging issues, actions to address issues and remarks. Preserve entity and period context throughout entry. Initial defaults may reuse unchanged profile data but must not copy prior-quarter achievement claims as if they happened again.

Acceptance: refresh restores a saved draft. Validation points to the affected field. Honest nonachievement and declared missing evidence can be submitted. Repeating the submit request with the same idempotency key produces one receipt and one revision.

## **FR06 Evidence handling**

Priority P0. Sources S02, S03 and W06. Accept PDF, DOCX, XLSX, JPEG and PNG as a proposed allowlist, with a default 20 MB per file and 100 MB per submission. Validate extension, file signature and size; reject executable, macro-enabled and password-protected material where inspection is not possible. Use generated storage names and retain the original name as metadata.

Acceptance: an upload is not attached to a submission until complete. A renamed executable is rejected. Protected downloads require current authorization. A replaced document becomes a new evidence version with a new hash. The system does not claim that a visible signature or successful OCR authenticates a document. For demo operation, only synthetic files are allowed; real-document operation requires malware scanning or quarantine before access.

## **FR07 Submission acknowledgment**

Priority P0. Sources S02 and S03. Persist receipt, evidence inventory and provisional calculation or explicit Pending baseline approval status before acknowledging success. A pending calculation is not a failed submission or a zero score. Queue notifications without requiring the external email provider to succeed.

Acceptance: a failed email does not undo a valid submission. A failed database transaction does not return a success receipt. The user can retrieve the receipt later from the application.

## **FR08 Provisional evaluation**

Priority P0. Source S02; detailed rubric proposed in Section 10\. Compute a deterministic result for each submitted revision. Distinguish claimed achievement, evidence supplied and officer-reviewed acceptance.

Acceptance: the same versioned inputs produce the same output. Missing supporting evidence gives no provisional credit for the dependent criterion. A file with a matching category can support a claim but cannot make an unclaimed achievement true. Recalculation cannot overwrite earlier versions.

## **FR09 Review and clarification**

Priority P0. Sources S02, S03 and S07; revision rules proposed. Provide evidence preview or authorized download, criterion decisions, review notes and actionable clarification requests. Show submission differences where feasible; at minimum expose both versions and their timestamps.

Acceptance: an officer can return one deficient criterion without deleting accepted evidence. The entity can respond. Finalization is blocked if the officer is reviewing an obsolete revision or required criterion decisions are unanswered. Unsupported claims may be finalized as zero with a reason after the configured cutoff.

## **FR10 Finalization and audit**

Priority P0. Source S02; safeguards proposed. Store criterion-level reviewed outcomes, finalized totals, reviewer and reason codes. An administrator override requires a distinct action and justification.

Acceptance: a score adjustment identifies which criterion changed and why. Reopening creates a new decision version. Audit entries cannot be edited or deleted through ordinary application endpoints. Do not call the record tamper-proof unless stronger infrastructure controls are implemented and verified.

## **FR11 Notifications and follow-up**

Priority P0. Source S02; channel and retry defaults proposed. Provide an in-app inbox and a demo email sink that makes delivery visible without contacting real recipients. Events include form publication, submission receipt, officer assignment, clarification, revised submission, finalization status, approaching deadline and annual publication.

Acceptance: each event is routed only to authorized recipients. A unique event-recipient-channel key prevents duplicates. Transient failures retry three times with backoff and then appear in an administrator failure queue. An email contains a minimal summary and authenticated link, not evidence or unreleased scores.

## **FR12 Oversight and comparison**

Priority P0. Source S02. Show eight-institution coverage, institution-quarter state, provisional versus reviewed results, officer review backlog, late flags and year-end status. Allow filtering by cycle, quarter, institution and assigned officer.

Acceptance: every chart has a corresponding accessible table and a defined denominator. Pending scores are not plotted as zero. Comparisons use the same profile and comparable finalized periods. An incomplete cohort is labelled with coverage and is not presented as a complete ranking.

## **FR13 Annual report and publication**

Priority P0. Source S02; release control proposed. Produce an institution report and consolidated oversight report with profile version, calculation method, quarterly decisions, annual foundation outcomes, coverage, late status, reviewer references and publication version. Provide CSV for structured oversight data and a print-friendly report.

Acceptance: totals match Section 10 fixtures. Entity exports contain only that institution's data. CSV cells with spreadsheet formula prefixes are safely encoded. A revised publication preserves the prior report and notifies the affected institution of the correction.

## **FR14 Time simulation and repeatability**

Priority P0. Source S02. A server-side demo clock supports advancing to named boundaries: quarter open, due date, overdue, year-end evaluation and publication. Scheduled logic and simulation share an event processor. Display simulated business time distinctly from actual audit time.

Acceptance: crossing several periods catches up each required transition once. Retrying a clock advance produces no duplicate notifications or obligations. Reset creates a new simulation run and clears only that run's fixtures; it cannot target a production environment.

## **FR15 Search and evidence retrieval**

Priority P0 basic lookup; P1 full-text search. Sources S07 and D01. Filter submissions and evidence by institution, period, category and review state. Avoid an unrestricted global document search.

Acceptance: search results, counts and filenames do not leak another institution's private records. A missing or revoked document produces an understandable response without exposing storage details.

## **FR16 Export and interoperability boundary**

Priority P0 documented export; live integration later. Sources S01 and S07. Define stable identifiers and a versioned export schema for institutions, periods, indicator decisions and published results. Include a sample JSON payload and CSV column dictionary in implementation documentation.

Acceptance: an exported published result can be traced back to its source decision identifiers. Integration demonstrations use a labelled mock receiver or local file. No claim is made that EACC or PSPMU has accepted the payload or approved an API.

# **9 Calendar and evidence policies**

## **9.1 Proposed financial year configuration**

For the FY2026/2027 demo, use Africa/Nairobi business time and the following dates. Reporting deadlines are calculated from the supplied requirement to report within 15 days after quarter-end. End-of-day cutoff at 23:59:59 and calendar-day treatment are proposed assumptions to confirm; no automatic weekend or holiday extension is assumed. \[S03\]

| Period | Reporting dates | Submission deadline |
| :---- | :---- | :---- |
| Q1 | 1 July to 30 September 2026 | 15 October 2026 |
| Q2 | 1 October to 31 December 2026 | 15 January 2027 |
| Q3 | 1 January to 31 March 2027 | 15 April 2027 |
| Q4 | 1 April to 30 June 2027 | 15 July 2027 |

Procedures, the risk assessment and mitigation plan have a separate 30 September 2026 deadline in the published guideline. The prototype must not imply that the 15 October quarterly deadline extends it. The proposed simulated evaluation cutoff is 31 July 2027; it is a demonstration setting, not an official EACC deadline. Reminders at seven days and one day before a deadline, and once when overdue, are proposed defaults.

## **9.2 Evidence categories and review meaning**

Procedure evidence contains the approved institutional procedure and approval details. Risk-assessment evidence is the comprehensive assessment report, including core and support functions. Mitigation-plan evidence identifies the approved plan and its activities. Training or establishment evidence is linked to the relevant foundation or plan deliverable where applicable. \[S03-S06\]

For quarterly implementation, the published cycle calls for a progress report accompanied only by signed CPC and IAO committee minutes. The entity completes structured progress fields and attaches those minutes; it should not be prompted to upload unrelated bulk evidence by default. The same minutes can support several activity claims through explicit references without creating duplicate files. Additional evidence requested during clarification must identify its purpose and be governed by organizer clarification rather than assumed to replace the cycle's submission policy. \[S03\]

Record evidence category, source filename, MIME type, size, hash, uploader, institution, period, submission revision, approval or meeting date where relevant, and a page or section reference. Digital signatures, OCR output and manually declared dates are different attributes. Human review remains necessary to assess relevance and adequacy. Scan legibility and mismatched entity or period are review issues, not automatic findings of fraud.

Proposed evidence suitability checklist: for every relied-on evidence version, the officer records institution match, reporting-period or effective-period match, relevance to the named claim, required approval/signature presence, and readability. Record Pass, Deficient or Not applicable with a reason for any exception; this checklist does not create a scoring exemption. Each accepted criterion cites a page or section and explains how it supports the completion condition. A deficiency that prevents substantiation blocks reviewed credit for the dependent claim until resolved or finalized unsupported. A visible signature is evidence of presence, not authenticated identity. Reused minutes must contain support for each separate claim; matching file metadata alone is insufficient.

# **10 Scoring specification for team review**

## **10.1 Status and scope of this specification**

The challenge specifies provisional scoring, officer validation and annual aggregation but does not supply a complete evaluator rubric. The following numerical rules constitute **Proposed Demo Rubric v1**, designed to make the prototype executable and testable. They are not EACC's official scoring method. Henry must obtain organizer clarification on the intended rubric before presenting these assumptions as accepted challenge rules. \[S02, D01\]

Build one configurable engine and one tested default profile, Hackathon Mock v1. It uses procedure 10, assessment 15, plan 15 and implementation 60\. The published 23rd Cycle structure uses assessment 10, plan 10 and implementation 80, with procedures as a prerequisite. Store the latter as a documented reference configuration; a second fully operational profile is optional and must not be described as officially validated merely because its weights match. \[S02, S03\]

## **10.2 Three different measures**

**Reporting timeliness** measures when the institution submitted. **Compliance achievement** measures which defined criteria are supported and accepted. **Risk severity** is probability multiplied by impact on the stored risk scale. None of these measures establishes a corruption prevalence rate or probability that a person committed an offence.

Do not blend timeliness into the numerical achievement score without an approved penalty rule. Show late status, days late, first submission time and first complete-evidence time separately. The absence of a configured deduction means a penalty not applied in demo, not a claim that official evaluation has no penalty.

## **10.3 Foundation checklists and partial credit**

Each foundation indicator uses four equally weighted checks. Each check is binary: 1 if claimed and supporting evidence is supplied for provisional calculation, or 1 if accepted by the officer for reviewed calculation; otherwise 0\. Thus partial indicator credit arises from supported checklist items, not arbitrary freehand percentages. All checks and their equal weighting are proposed defaults.

| Indicator | Four proposed checks | Maximum points |
| :---- | :---- | :---: |
| Procedures | Institutional identity and scope; prevention procedure content; approval details; designated implementation responsibility | 10 |
| Risk assessment | Coverage of core and support functions; identified risks and causes; probability and impact on declared scale; existing controls and assessment context | 15 |
| Mitigation plan | Link to identified risks; strategies and activities; outputs and KPIs; responsibility, resources and timeframe | 15 |

Indicator fraction \= accepted checks divided by 4\. Indicator contribution \= maximum points multiplied by that fraction. A missing document means no provisional credit for its dependent checks. A supplied generic template with no institutional adoption does not satisfy approval or institution-specific checks. For reviewed credit, the officer must identify supporting material and may reject an asserted check with a reason.

The foundation readiness shown in each quarter is the latest applicable reviewed or provisional state for that period, clearly labelled. The annual score uses one final foundation decision per indicator, assessed at the evaluation cutoff. Foundations contribute at most 40 annual points and are never summed four times. Late adoption can improve the proposed annual achievement result, but its late flag and prior deficient states remain visible. Organizer confirmation is required for how late foundation achievement affects official evaluation.

Foundation validity rule, proposed: each version records approval reference, effective-from value, effective-to value where known, status (active, superseded or withdrawn), and predecessor/successor links. Distinguish when a change was recorded from when it takes effect; never infer that a new upload was valid in an earlier quarter. A current-year foundation may support several quarters only when its declared and reviewed validity covers them. Replacing a plan does not automatically change the locked milestone baseline.

At final evaluation, the officer selects and records the foundation version effective at the original cycle evaluation cutoff and reviews its criteria. A clarification extension can establish which version was valid then, but cannot award credit for foundation achievement occurring only during the extension. A withdrawn version cannot supply current credit; if no valid replacement supports a check, its final fraction reflects that deficiency. Unknown or conflicting effective dates require clarification and block final foundation disposition until resolved or explicitly found unsupported after the response window. Supersession preserves historical evidence and decisions; an assertion that an earlier document was invalid triggers dependency re-review or the published correction process, not silent historical deletion.

## **10.4 Implementation denominator and milestone credit**

Before a quarter opens, the assigned officer must approve and activate a locked baseline of scored milestones due in that quarter. Record plan version, approver, approval time and effective period. Approval checks material risk coverage, objective completion conditions, mandatory committee obligations and duplicate or artificially fragmented activities. Institutional plan approval and officer acceptance of the scoring baseline are separate records.

For the simulated year only, an administrator may load a historical baseline labelled SEEDED HISTORICAL BASELINE. The assigned officer confirms its correspondence to the fictional approved plan before any dependent score is finalized. Preserve the actual load and review timestamps, the simulated effective period and the exception reason; never backdate approval or imply that it occurred live. A historical seed cannot be used to delete missed milestones or tailor the denominator to observed results. Live late onboarding requires an authority-approved policy outside this exception.

 Each milestone links to a mitigation activity, has a positive weight, a measurable completion condition and an evidence expectation. For the demo, use equal milestone weights of 1; explicitly show that these weights are a simplification and do not prove equal real-world importance. A future approved rubric can assign different fixed weights without changing the formula.

The baseline includes recurring CPC and IAO meeting obligations as separate milestones each quarter, plus the institution's planned mitigation milestones. Meeting credit requires the relevant signed minutes; the same minutes can substantiate other milestones only where their content supports those claims. The decision to score these obligations as milestones is proposed, while their underlying reporting significance comes from the guidelines. \[S03, S06\]

A milestone earns 1 for completed and supported, and 0 otherwise. Partially completed activities should be split into objective milestones when the baseline is agreed; reviewers do not invent a 50 percent activity value during evaluation. Each quarter must have at least one due milestone before its baseline can be activated. An empty baseline is a configuration error, not automatic full credit.

Implementation fraction Iq \= sum of weights for accepted completed milestones due in quarter q divided by sum of all locked milestone weights due in quarter q. Provisional Iq uses claimed completion with supplied evidence; reviewed Iq uses officer-accepted completion. Fractions are bounded between 0 and 1\.

Late work completed in a later quarter remains visible as corrective progress but does not earn the same milestone twice. Under this proposed schedule-adherence model, a milestone not completed by its original quarter end earns zero for that quarter; accepting later-submitted evidence that proves on-time completion can correct it before cutoff. This is a demonstration choice requiring organizer confirmation, not a finding that official rules prohibit late implementation credit.

An entity cannot improve its denominator by deleting an unfinished activity, moving its due date retrospectively or marking it not applicable. An amendment requires a reason and officer confirmation, is effective for unopened future periods, and retains the original baseline. Mandatory committee obligations cannot be excluded through an entity self-declaration. No automatic not-applicable denominator reduction exists in the MVP.

## **10.5 Quarterly and annual calculation**

Let P, R and M be the procedure, assessment and mitigation-plan fractions between 0 and 1\. For each quarter, an internal readiness snapshot is Qq \= 10Pq \+ 15Rq \+ 15Mq \+ 60Iq. This snapshot combines foundation readiness as of that quarter and the quarter's implementation result. It is not a claim that a foundation document was produced again that quarter.

The annual demo score is A \= 10Pfinal \+ 15Rfinal \+ 15Mfinal \+ 60 times ((I1 \+ I2 \+ I3 \+ I4) divided by 4). This uses foundations once and gives each quarter equal implementation weight. Do not average the four full readiness snapshots, because doing so would introduce an unintended timing penalty for foundation readiness. Both the equal-quarter choice and final-foundation treatment are proposed policies.

A missing quarter stays missing while evaluation is open. No final annual result is published until each quarter has an officer disposition. At the applicable cutoff, an officer may close a nonresponse quarter with Iq \= 0 and a reason, subject to the clarification-window protection and authorized extensions in Section 7.3. A submitted but unreviewed quarter remains pending and blocks release; it is not automatically treated as noncompliance because an officer has not acted. There is no renormalization over only the quarters that are reported.

Use decimal or rational arithmetic at adequate precision. Round only displayed final values to two decimal places using a documented consistent rounding mode, proposed half-up. Store component fractions and calculation versions. Avoid summing rounded subcomponents as the authoritative total.

## **10.6 Worked examples**

Example A has all foundation checks accepted and quarterly implementation fractions 0.50, 0.75, 1.00 and 1.00. Implementation average is 0.8125. Its annual score is 10 \+ 15 \+ 15 \+ 60 times 0.8125 \= **88.75 out of 100**. Each of the four periods remains separately visible.

Example B has procedure fraction 1, assessment fraction 0.75 and plan fraction 1\. Its foundation contribution is 10 \+ 11.25 \+ 15 \= 36.25. Quarterly implementation fractions are 0.50, 0.75, 0 and 1.00, where Q3 was explicitly closed for nonresponse. Annual score is 36.25 \+ 60 times 0.5625 \= **70.00**. Before Q3 closure, the annual result is pending, not 70.00.

Example C reports four of four milestones as complete. All evidence references exist, so provisional implementation credit is 60\. The officer finds only three claims supported, yielding 60 times 3/4 \= **45** reviewed implementation points. The decision history retains both values and the rejected criterion's reason. The file upload itself did not establish the fourth achievement.

Example D has eight planned milestones and completes four. Its implementation fraction is 4/8 \= **0.50**. Deleting the four unfinished rows through a revision is disallowed; it cannot become 4/4. This is an essential anti-gaming test.

Example E submits one day late with otherwise accepted achievement. The demo achievement calculation is unchanged; the report shows late submission and penalty not configured. This result must not be represented as an official penalty-adjusted score.

## **10.7 Guardrails for comparisons**

Compare institutions only within the same cycle and profile, with review coverage visible. Different mitigation plans can have different ambition and complexity, so equal scores do not prove equal risk reduction. Do not rank incomplete annual evaluations among finalized results. For cohort averages, states which finalized institutions are included and show their count against the eight expected institutions. A pending cohort is never presented as a complete national performance picture.

Fairness and gaming example: two committee obligations plus two substantive activities produce four equal milestones. Completing only the committee obligations yields 2/4 \= 50%. Adding eight trivial completed tasks would make the same substantive nonachievement appear as 10/12 \= 83.33%, and shrink committee obligations from half to one sixth of the denominator. The baseline reviewer must reject duplicate, trivial or artificially split milestones and document material risk coverage before activation. Preserve that rationale for audit. No new weighting or denominator cap is silently introduced: approved grouped weights require a separately agreed profile. Until validated, display plan size and coverage limitations beside comparisons and avoid league-table claims. Equal scores represent performance against different accepted plans, not equal prevention impact.

# **11 User experience requirements**

Each role lands on its next actionable work. The institution sees what is due and what requires clarification. The officer sees assigned submissions and oldest unresolved work. The supervisor sees coverage and bottlenecks. The administrator sees publishing, assignments and failed notification jobs. Avoid giving every role the same dashboard with different menu visibility.

The institutional form should group questions by deliverable, explain acceptable evidence beside the upload field, show draft save state and provide a review-before-submit page. Keep server validation messages next to the relevant field and retain input after recoverable errors. Display file transfer progress and allow retry without duplicating a completed upload. Support laptop and narrow mobile layouts without making large evidence review tables unusable.

The officer workspace must place claim, rule, evidence reference and decision close together. Use plain labels such as Evidence missing, Awaiting officer review and Finalized. Do not use a green badge labelled compliant merely because a file exists. Show unavailable evidence, scan quality concerns and stale revisions as actionable conditions.

The proposed accessibility target is WCAG 2.2 AA for core journeys, verified through keyboard use, visible focus, labelled controls, understandable validation and sufficient contrast. Do not communicate status by color alone. Tables need headers; charts need a tabular alternative. Avoid authentication patterns that unnecessarily block password managers or paste. A full conformance claim requires a broader audit than the hackathon checks. \[W07\]

The initial language is English, with plain terminology and definitions for CPC, IAO and CRAMP. Localization is a future capability rather than a promise of translated official terminology. All dates show the financial year and Africa/Nairobi context where ambiguity could affect deadlines.

# **12 Data model and information contracts**

## **12.1 Core records**

| Record | Essential fields and invariants |
| :---- | :---- |
| Institution | Stable ID, name, type, focal contact, Accounting Officer contact, active status; no real production identities in fixtures |
| User and membership | User ID, institution scope, role, active status; role changes audited |
| Officer assignment | Institution, officer, valid-from and valid-to; one primary current officer per institution in demo |
| Cycle and period | FY, timezone, start, end, deadlines, evaluation cutoff, profile version |
| Form version | Stable question IDs, response schema, evidence policy, indicators, publication timestamp |
| Scoring profile | Weights, checklist definitions, formula version, rounding rule, status and source references |
| Risk and plan version | Risk description, cause, scale, probability, impact, approved-plan reference and baseline status |
| Activity and milestone | Strategy, output, KPI, target, unit, owner, resources, due quarter, weight and completion condition |
| Submission revision | Institution, period, form version, plan version, answers, submitter and receipt timestamps |
| Evidence version | Storage key, hash, file metadata, category, institution, references, upload and inspection state |
| Clarification | Criterion, request, requester, due date, response revision and resolution |
| Score decision | Provisional or reviewed, input versions, component results, total, reviewer and reasons |
| Annual evaluation | Four quarter dispositions, final foundation decisions, coverage, formula and derived result |
| Publication | Evaluation snapshot, publisher, release time, version, superseded reference and correction reason |
| Notification and audit event | Event ID, recipient scope, delivery status; actor, object version, actual time and simulated time |

Relationships must preserve the path from institution to cycle, plan, activity, quarter, evidence, decision and publication. A score references immutable versions rather than whichever document happens to be current. Database constraints enforce one obligation per institution per period and unique event-delivery keys. Application checks and storage permissions enforce the same institution boundary.

Additional required fields: baseline approval state, approver, actual approval time, effective period and historical-seed reason; submission authority attestation and institutional approval reference/status; criterion dependency IDs and carry-forward confirmation; evidence suitability results and cited passages; foundation effective interval and supersession links; clarification availability/notified times, response due time and extension authorization. Immutable decisions retain their original dependencies. Patrick owns persistence, validation and export contracts, with Jason drafting fixtures and data examples for review. Jamal owns the interface states and explanations, with Samuel contributing copy and interaction drafts. Henry approves domain interpretation and acceptance evidence.

## **12.2 Source template coverage**

Risk rows retain identified risk, source, probability, impact and calculated severity. Plan rows retain strategy, activities, output, KPI, resources, timeframe and responsibility. Quarterly progress retains risk and mitigation references, activities implemented, outputs achieved, emerging issues and actions addressing those issues. These fields preserve the supplied template relationships instead of flattening all content into one narrative textbox. \[S03-S05\]

Profile contacts and approval details should be entered once and referenced when unchanged. Avoid collecting national identity numbers, individual asset declarations or complainant information for Track 2\. They belong to different business purposes and are unnecessary for the proposed MVP.

## **12.3 Export contract**

The proposed export includes schema\_version, simulation flag, cycle\_id, institution\_id, period\_id, form\_version, scoring\_profile\_version, submission\_revision, decision\_id, indicator\_id, maximum\_points, earned\_points, status, reviewed\_at and publication\_version. Reports also include the rule explanation and missing-data status. Exported evidence is an authorized reference or manifest, not a public storage URL. Define timestamp formats and units explicitly; budgets include currency, proposed KES for fixtures.

# **13 Security privacy and operational quality**

## **13.1 Prototype security boundary**

All demo institutions, contacts and evidence are fictional. Real signatures and personal information from the supplied college example must not be copied into fixtures. Use example.invalid addresses and a local or controlled email sink. Do not contact the real reporting address in the guideline during demonstrations.

Apply server-side authorization to every object access, deny ambiguous scope, use authenticated private evidence retrieval and avoid public storage buckets. Use TLS for any hosted environment, secure session handling, secret management outside source control and throttling of login and upload endpoints. Log operational events without copying evidence text, credentials or unnecessary personal data into logs. \[W05, W06; proposed implementation\]

Evidence parsers and any optional AI worker must treat uploaded contents as untrusted data. Document text cannot grant permissions, change scoring policy, invoke tools or trigger external network requests. A reviewer-supplied link is not automatically fetched by the server. The application should reject unsafe uploads and serve permitted files with safe download behavior.

## **13.2 Privacy and production gates**

ODPC guidance emphasizes lawful and transparent processing, purpose limitation, minimization, accuracy, storage limitation and protections for transfers outside Kenya. For this product, the proposed consequence is to collect only necessary institutional contacts, keep evidence private, document permitted use, and establish retention and access procedures before handling live information. Do not assume that every processing activity relies on consent or that a single hosting location automatically establishes compliance. \[W04\]

Before a production pilot, the responsible organization must establish controller and processor responsibilities, the lawful processing basis, retention and deletion rules, data-subject request handling, cross-border processing safeguards and whether a data protection impact assessment is required. Deployment location, backup location and any AI provider data handling require explicit review. The PRD does not invent a statutory retention period or claim legal certification.

For the hackathon, fixtures can be reset by simulation run. For a pilot, retention must preserve decision evidence and lawful holds while allowing authorized deletion or redaction under the approved schedule. Audit retention and evidence retention may differ and should not be set to forever by default.

## **13.3 Reliability and recovery**

A submission, provisional result and notification event must be committed consistently. Use a transactional outbox or equivalent durable mechanism so provider failures do not lose work. Jobs must be idempotent and report failed attempts. A crash after saving a submission but before sending an email must recover without a duplicate submission.

Define recovery behavior for interrupted uploads, expired sessions, concurrent edits and unavailable evidence storage. The user must see whether work was saved. Proposed demo recovery target is restoration of a known fixture state within five minutes; verify it in rehearsal. Production recovery-point and recovery-time objectives require agreement and restore testing rather than guessed service guarantees.

# **14 Innovation and AI boundaries**

The main innovation is a traceable evaluation workflow: configurable requirements, stable evidence, reproducible provisional calculations, officer decisions and a full annual simulation. This directly addresses reporting and evaluation work. AI is an optional enhancement; the general rubric mentions emerging technology and AI but does not establish a mandatory feature or its weight. \[S01, S02\]

If P0 is complete, implement a narrow evidence assistant that extracts candidate institution names, meeting dates, relevant passages and possible missing information. Every suggestion must link to the original page or section, disclose that it is machine-generated and allow the officer to accept, amend or dismiss it. The assistant does not authenticate signatures, decide legal compliance, assign final scores or publish results.

Proposed evaluation uses at least ten synthetic documents, including a scan, a wrong-quarter document, an unrelated document and an embedded instruction asking the model to award full marks. Record extraction correctness and unsupported assertions. Core reporting and scoring must remain usable if the model is unavailable. Do not send real evidence to an external model until data-processing and transfer arrangements are approved.

# **15 Proposed architecture and implementation boundaries**

A modular monolith is the proposed starting point: a web client, authenticated application API, relational database, private object storage and background worker. The API owns permissions, workflow transitions and scoring. The worker processes durable notifications and calendar events. A server-side clock interface supplies real or simulated business time. This structure reduces hackathon coordination overhead while keeping clear boundaries for later scaling.

Technology and hosting choices remain a team decision. The requirements do not mandate a particular frontend framework, programming language, cloud provider or database product. Prefer tools the team can operate and explain. The database must support relational integrity and transactions; evidence storage must enforce private access; authentication must support revocation and role scope.

Proposed service boundaries are identity and assignments, cycle and form configuration, reporting and evidence, evaluation, notifications, and analytics/publication. A shared calculation module must be used for provisional scores, reviewed totals and annual reports. The frontend must not implement a different authoritative formula. Store calculation inputs and versions so results can be reproduced in a test runner.

API operations should expose intent: publish a form, submit a revision, request clarification, finalize a decision and publish an evaluation. They should not permit a generic client update to jump directly from draft to published. Use optimistic concurrency for revisions and idempotency keys for submission and event-producing operations.

Interoperability is demonstrated through documented JSON and CSV contracts and a labelled mock consumer. EACC's current official reporting channel is email in the supplied cycle guidance; a prototype portal receipt is not automatically an official EACC receipt. Any replacement, coexistence or forwarding arrangement must be agreed before live rollout. The PSPMU handoff described in the prevention deck is a future integration requirement, not an available API. \[S03, S07\]

# **16 Verification and acceptance scenarios**

## **16.1 Mandatory scenario set**

| Test | Scenario | Required result |
| :---: | :---- | :---- |
| AT01 | Entity changes institution ID in request | Access denied; no filename, count or evidence leak |
| AT02 | Officer opens unassigned institution | Access denied across API, dashboard, export and download |
| AT03 | Publish invalid form weights | Publication blocked with actionable error |
| AT04 | Publish edited valid form | New question and evidence rule appear without deployment |
| AT05 | Edit future form after submission | Historical response and score unchanged |
| AT06 | Retry same submission after timeout | One revision, receipt, score calculation and event |
| AT07 | Submit declared missing evidence | Receipt exists; affected credit zero; deficiency explicit |
| AT08 | Officer rejects unsupported claim | Reviewed score differs with criterion reason and evidence reference |
| AT09 | Clarification and revised evidence | New revision; earlier receipt and evidence preserved |
| AT10 | Finalize obsolete revision | Version conflict; officer must review latest revision |
| AT11 | Submit at and after deadline | Boundary classified consistently in Nairobi business time |
| AT12 | Email sink fails then recovers | Submission persists; retries visible; no duplicate inbox event |
| AT13 | Advance through all four quarters twice | All 32 obligations represented; transitions not duplicated |
| AT14 | Q3 unreviewed at annual evaluation | Annual publication blocked for that institution |
| AT15 | Officer closes Q3 nonresponse | Explicit zero disposition; annual example B equals 70.00 |
| AT16 | Complete annual example A | Annual score equals 88.75, with four quarters and foundations once |
| AT17 | Entity deletes incomplete activity | Locked denominator unchanged; amendment path required |
| AT18 | Read unreleased annual score | Entity API and export withhold numerical result |
| AT19 | Publish ready batch | Entity sees only own released result; report identifies unresolved institutions |
| AT20 | Correct published decision | New version published; old result superseded and retained |
| AT21 | Malformed or disguised upload | Rejected or quarantined; cannot be opened as accepted evidence |
| AT22 | Reassign or deactivate officer | Access revoked appropriately; historical authorship preserved |
| AT23 | Keyboard-only core journey | No keyboard trap; visible focus, labels and usable validation |
| AT24 | Restart or reset demo | Known run restored without touching another run or production |

Calculation tests also cover zero and full achievement, rounding, unsupported checklist items, same-file references across claims, differing plan sizes, amendment effective dates and a document received late that proves on-time completion. Integration tests exercise state transitions and access boundaries. End-to-end tests cover the full institution-officer-supervisor-administrator journey. Do not substitute screenshot tests for score and permission tests.

Additional mandatory acceptance scenarios AT25–AT32 extend the scenario set above and use the same acceptance standard.

AT25 — Baseline timing (FR04, Section 10.4): activation without officer approval is blocked; a report can be received with scoring pending. A labelled historical seed preserves actual timestamps and cannot remove missed work.

AT26 — Submission authority (FR05, Section 7.2): absent authority attestation blocks formal submission but preserves the draft. An authorized user can declare institutional approval evidence unavailable; the receipt and review deficiency retain that distinction.

AT27 — Decision invalidation (FR09–FR10, Section 7.3): replacing one file used by two criteria marks both decisions Needs re-review. An unrelated decision carries forward only after explicit confirmation; obsolete finalization fails and historical decisions remain intact.

AT28 — Foundation validity (FR04, FR08–FR10, Section 10.3): supersede or withdraw an assessment. Earlier quarterly evidence remains accessible; the annual evaluation uses the version effective at cutoff, and unsupported current checks cannot retain credit from a withdrawn version.

AT29 — Cutoff fairness (FR02, FR09, FR13, Section 7.3): issue a clarification two calendar days before cutoff. The full proposed seven-day response window is retained, adverse closure is blocked, and an authorized extension or pending disposition is required. A timely reply awaiting the officer is review backlog, not nonresponse; unrelated deadlines remain unchanged.

AT30 — Evidence suitability (FR06, FR09, Section 9.2): a wrong-institution, wrong-period or unreadable file can exist as an uploaded record but cannot substantiate an affected criterion. The checklist, passage reference and reason distinguish an evidence deficiency from an allegation of fraud.

AT31 — Denominator gaming (FR04, FR08, Section 10.7): present the four-milestone baseline and the inflated twelve-milestone proposal to the reviewer. The latter cannot activate until the officer resolves artificial fragmentation and records material coverage; no silent reweighting or retrospective deletion occurs. Comparison output exposes plan size and limitations.

AT32 — Worked case (FR08, FR10, FR13, Section 3.3): four claimed Q1 milestones give provisional I1 \= 1; one unsupported claim gives reviewed I1 \= 0.75. With the stated other quarters and foundations, publication yields 96.25, retains the rejected claim and only exposes the entity's own released result.

## **16.2 Definition of done**

P0 is done when all mandatory scenarios pass, the team can reproduce a clean run from setup instructions, and no known defect compromises access isolation, scoring, evidence preservation or publication boundaries. The demo must show actual persisted operations. Seeded history is acceptable when clearly identified; manually prepared dashboard totals are not evidence of functioning calculation logic.

Review the architecture diagram, data dictionary, scoring examples and source traceability alongside the running product. Record remaining limitations honestly. Performance numbers, accessibility claims and AI accuracy must reflect tests actually run. Include AT25–AT32 in P0 verification. Record the Section 4.2 user-validation findings, distinguish external practitioner validation from internal role-play, and resolve critical findings before claiming validation. External participants being unavailable does not invalidate a functioning hackathon demo, but it remains a disclosed limitation and pilot gate.

# **17 Demonstration and judging evidence**

## **17.1 Fictional fixture design**

Use eight fictional institutions labelled DEMO-001 through DEMO-008. Officer A owns 001-004 and Officer B owns 005-008. Each institution has four period obligations and an active plan baseline. No fixture implies wrongdoing by a real institution.

| Institution | Principal scenario |
| :---- | :---- |
| DEMO-001 | Full foundation readiness and implementation trajectory used in annual example A |
| DEMO-002 | Missing evidence followed by clarification and correction |
| DEMO-003 | Late submission with explicit timeliness flag |
| DEMO-004 | Unsupported completion claim reduced by officer review |
| DEMO-005 | Missing Q3 and foundation partial credit used in annual example B |
| DEMO-006 | Future plan amendment that preserves prior denominator |
| DEMO-007 | Uploaded evidence for the wrong period, corrected by a new version |
| DEMO-008 | Assignment change and controlled post-publication correction |

## **17.2 Proposed demonstration sequence**

Start by explaining one institution's reporting problem and the four user roles. Publish a form with a visible administrator-made change. Submit a response as an institution and show its receipt. Review it as the assigned officer, reject an unsupported claim and request clarification. Respond as the institution, then finalize the latest revision. Show the supervisor's portfolio and unresolved work. Demonstrate denied access to an unassigned institution.

Advance the clock through the remaining periods with a scripted scenario driver that submits through the same application services. Show the missing-quarter effect before and after officer disposition. Generate the annual report, verify the 88.75 and 70.00 examples, and publish results. End with the institution's own released report and the audit trail. If time allows, show a notification retry and a corrected publication.

The script is modular because the official presentation duration is unconfirmed. Prepare a short core path and an extended technical path after the organizer supplies the time limit. Keep a labelled recorded fallback and local fixture restore procedure, but do not present a recording as a live operation.

## **17.3 Evidence against judging criteria**

| Criterion | Demonstrable evidence | Primary contributor |
| :---- | :---- | :---- |
| Track understanding and functionality | Correct reporting cycle, eight entities, four roles, evidence and annual evaluation | Henry with all members |
| UI and UX | Four task-focused journeys, clear states and correction flows | Jamal leads; Samuel contributes |
| Solution architecture | Permission boundaries, stable versions, durable events and deployment explanation | Patrick with Henry |
| Code quality | Tests for score and access rules, readable modules and reproducible setup | Patrick and Jamal |
| Emerging technology and innovation | Working automation; optional evaluated evidence assistant | Patrick leads; Jason contributes |
| Scalability and interoperability | Configurable assignments, scoped data, measured rehearsal and export contract | Patrick leads; Jason contributes |
| Compliance accuracy | Published versus mock distinction, evidence policy and traceable score explanation | Henry leads; Jason contributes |

The general rubric labels several criteria individually, but neither the assessment format nor weights are established. Each team member should be able to explain their own contribution and a relevant tradeoff. Avoid inventing percentages or mandatory presentation slots. \[S01, S02\]

# **18 Team ownership and delivery gates**

## **18.1 Ownership**

| Team member | Delivery role and contribution | Essential collaboration |
| :---- | :---- | :---- |
| Henry Ohanga | Product scope, business analysis, organizer decisions, acceptance and pitch | Architecture with Patrick; UX with Jamal; Jason supports scoring checks and Samuel supports validation |
| Patrick Mwangi | Technical lead: backend, data contracts, scoring, simulation, analytics, integrations, security and audit | Reviews Jason's data/fixture contributions; agrees API states with Jamal; Henry approves domain policy |
| Jamal Guyo | Frontend and UX lead: tooling, journeys, forms, review workspace, dashboards, reports and accessibility | Reviews Samuel's design contributions; Patrick reviews server/export contracts; Henry accepts journeys |
| Jason Ndirangu | Data and testing contribution: synthetic records, fixture drafts, query/report examples and test evidence | Patrick reviews technical work; Henry approves independent expected results and acceptance evidence |
| Samuel Okello | Design and validation contribution: wireframe drafts, interface copy, accessibility checks and session notes | Jamal reviews design/tooling/accessibility work; Henry owns validation plans, findings and acceptance |

Delivery accountability sits with Henry for scope, domain decisions, validation and acceptance; Patrick for technical design, data, backend and security; and Jamal for frontend, UX and accessibility. Samuel contributes design and validation artifacts within Jamal's and Henry's workstreams. Jason contributes data, fixture and test artifacts within Patrick's and Henry's workstreams. Each contribution has a defined task, expected output and named reviewer; the accountable lead approves decisions and completion. Contributors retain credit for the work they deliver.

QA is shared. Henry owns independent expected-result approval and final AT01–AT32 acceptance, with Jason preparing calculations and evidence. Patrick verifies technical correctness and access controls; Jamal owns interface and accessibility verification with Samuel contributing checks and notes. Scoring implementation cannot be its own sole acceptance oracle. Review and integration time are part of capacity planning, not implicit extra work.

## **18.2 Dependency based delivery gates**

Gate 1 is scope agreement: select the demo profile, record unresolved organizer questions and agree on P0. Gate 2 is a thin working path: authenticate, publish one form, submit one institution response, compute one score and review it. Gate 3 adds evidence versioning, clarification, full role restrictions and durable notifications. Gate 4 expands to all eight institutions and four periods, then annual aggregation and publication. Gate 5 is rehearsal, negative testing, documentation and judging evidence. P1 work begins only when Gate 4 is reliable and Gate 5 has enough time reserved.

Preliminary planning estimate, proposed for owner review: scope and scoring alignment, 8–12 combined person-hours (Henry accountable; Jason contributes); shared workflow design and interaction patterns, 12–18 (Jamal accountable; Samuel contributes); identity, configuration, baseline and submission path, 24–36 (Patrick/Jamal); evidence, dependency-aware review and clarification, 24–36 (Patrick/Jamal); fixtures, calculation checks, simulation and analytics, 20–30 (Patrick accountable; Jason contributes); annual publication and exports, 12–18 (Jamal accountable; Patrick reviews contracts; Jason contributes); integrated verification, documentation and rehearsal, 20–30 (all, Henry accountable). These non-overlapping work packages total 120–180 combined person-hours before a proposed 20% contingency, or 144–216 including it. They are initial estimates, not team commitments, elapsed time or official event duration; avoid double-counting shared work.

At Gate 1, each owner replaces these ranges with an estimate based on available hours and agreed stack. Henry maps dependencies and confirms event duration and delivery constraints under O13–O14. If capacity is below the revised estimate, record the chosen simplifications before committing. Keep the critical path visible: agreed scoring and data contracts → end-to-end submission/review → annual release → verification/rehearsal. Parallel work does not remove the technical, frontend and acceptance review capacity constraints.

Simplification order: first omit all P1 features, AI, bulk import, separate advisory management and a second active profile. Then use a constrained form editor, authorized file downloads instead of rich previews, explicit Save instead of autosave, one documented export format and a compact dashboard; use clearly labelled seeded history for repeated quarters while demonstrating a real end-to-end path. Retain eight entities, four periods, role isolation, configurable forms, safe evidence, reproducible scoring, decision history, durable notifications, annual publication and mandatory tests. Henry must confirm any change that would omit a challenge-required behavior; such a build is partial, not a completed P0.

# **19 Decision register and organizer questions**

The [domain decision register](domain-decisions.md) is the maintained record for O01–O17. It contains each organizer question, explicit confirmation status, working prototype default, source boundary, affected requirements and Linear issues. Update answers there so mutable policy is not copied across tickets and this document.

Sections 6 and 10 retain the detailed product scope and proposed scoring specification. The register records how unresolved organizer constraints affect them, the simplification order and the verification required when an answer changes a default. A prototype default is not an organizer-confirmed rule. Linear holds assignments, schedules and implementation status.

# **20 Risks and review checklist**

| Risk | Consequence | Mitigation and owner |
| :---- | :---- | :---- |
| Mock rules mistaken for official policy | Misleading compliance claim | Profile labels, source register, explicit organizer decision; Henry |
| Undefined or mutable denominator | Inflated scores and unfair comparison | Locked milestones and independent score fixtures; Patrick leads; Jason contributes |
| Upload mistaken for verified compliance | Unsupported credit | Separate claimed, supplied and reviewed states; Patrick and Jamal accountable, Samuel contributes interface copy |
| Missing quarter hidden by averaging | Inflated annual result | Four explicit dispositions, no renormalization; Patrick accountable, Jason prepares fixtures, Henry accepts results |
| Institution or score data leak | Loss of trust | API and file-access negative tests; Patrick |
| Feedback omitted | Users cannot resolve deficiencies | Clarification and revision loop; Jamal accountable, Samuel contributes interaction drafts |
| Feature expansion overwhelms core | Incomplete demonstration | Gate-based scope and P1 cut line; Henry |
| Provider or network outage | Demo interruption or lost notification | In-app inbox, email sink, retries and fixture recovery; Patrick accountable, Jason prepares recovery fixtures |
| Individual work not visible | Weak judging evidence | Contributor-specific explanations and artifacts; all members |
| No verified outcome baseline | Unsupported impact claims | Report measured workflow outcomes only; Henry leads; Jason contributes |

The review should establish whether a new reader can explain the institutional problem, distinguish the four roles, follow one evidence-backed score, understand why annual aggregation works, and identify which rules are proposed. Each member should flag requirements that are ambiguous, infeasible within the event or inconsistent with their implementation boundary.

The PRD is ready to baseline when the team agrees on P0, assigns every unresolved decision, accepts or revises the proposed rubric, and confirms the event constraints that affect scheduling. Agreement should be recorded as a version change with decision references rather than inferred from silence.

# **21 Source register and traceability**

## **21.1 Supplied sources**

Local filenames below refer to Resources/DIALS Innovation Challenge in the shared project. Source locators use supplied PDF page numbers, named document sections or slide topics rather than guessed Word pagination. The duplicate decks also supplied directly under Downloads and Resources contain the same bytes as their corresponding folder copies.

S01. ADILI ONLINE V3 INNOVATION HACKATHON 1.docx. Sections Tracks, Team Composition and Proposed Judging Rubric. Establishes chosen track, four-to-seven-person team range, permission to use dummy data and proposed judging categories. No judging weights or event timetable are stated in the supplied brief.

S02. PC Indicator \- MVP Task (1).docx. Sections Objective, Scenario Setup, System Requirements, Deliverables, Evaluation Criteria and Mock Deliverables. Primary prototype specification: eight institutions, four roles, dynamic forms, quarterly simulation, provisional and reviewed scores, dashboards, annual reporting and end-period publication. Numerical evaluation details beyond mock weights are incomplete.

S03. CORRUPTION PREVENTION PC GUIDELINES 23rd Cycle\_.pdf and PERFORMANCE-CONTRACT-FOR-2026-2027-FINANCIAL-YEAR-.-23RD-CYCLE-CORRUPTION-PREVENTION-GUIDELINES-2.pdf. These are byte-identical. Pages 2-3 establish weights, prerequisites, deadlines, implementation and evidence requirements; page 4 provides the risk, mitigation and progress templates. Verified against the official online download W01.

S04. EACC \- A Practical Guide for Corruption Risk Assessment.pdf. PDF pages 35-38 explain assessment, ranking, mitigation and monitoring; pages 48-52 provide risk, plan, monitoring and progress templates. Supports field relationships and the distinction between risk assessment and performance evaluation. Its illustrated 3 by 3 matrix differs from the 5 by 5 template inputs.

S05. EACC-CRA-GUIDELINE-.pdf. A different supplied rendering/version of the practical guide; risk-ranking discussion at PDF page 37 and appendices near the end. Appendix numbering and text extraction differ. Preserve source title and template heading, not appendix number alone, in application references. Related official download accessed as W02.

S06. CPC-GUIDELINES-6.06.2023.pdf. PDF pages 16-21, particularly CPC roles and meetings and IAO roles and meetings. Explains institutional actors, quarterly meetings, reporting and signed records. Related official download accessed as W03.

S07. Hackathon\_final-3\_ppt.pptx. Slides titled Anti-Corruption Indicator Process and current status, Corruption Prevention Strategies Anti-Corruption Indicator, and Desired Automation Features. Read image-based content as well as text. Supports current workflow, wider scale context, advisories, oversight and future interoperability. Systems-review follow-up cadence is distinct from quarterly PC reporting.

S08. Adili-Review.docx. Appendix IV Module for Monitoring Reviews and Advisories, steps 1-7. Supports acknowledgement, implementation matrices, EACC feedback, revisions, evidence and status tracking. Full module deferred; basic quarterly feedback retained.

S09. Model-Procedures-for-Prevention-of-Bribery-and-Corruption.pdf. Generic model, including risk assessment and management and Annex 2 compliance checklist. Also model procedures for prevention of bribery and corruption.pdf, a 22-page scanned adaptation for Dr. Daniel Wako Murende TVC. The latter is an institutional example with real identifying content and must not be copied as demo evidence. These are not duplicate documents. Official generic model accessed as W08.

S10. COI OVERVIEW-UNODC.pptx. Overview of the Conflict of Interest Act and wider Adili context. Supplied twice with matching file hashes. Used to maintain scope separation, not to impose individual COI processes on Track 2\.

S11. Conflict of Interest Automation 09-03-2026 \- Final.pptx. Slides 5-8 describe adjacent declaration automation and deployment/integration options. Supplied twice with matching hashes. Context for future interfaces, not a requirement to build declarations or adopt a particular hosting model.

S12. Conflict of Interest Act.pdf and The Conflict of Interest Regulations 2026.pdf. Legal context for adjacent tracks. The supplied Act copy identifies legislation as at 5 August 2025; the Regulations identify legislation as at 26 March 2026\. No assertion of current consolidated legal status is made for these files in this PRD.

S13. Final-Draft-Administrative-Mechanisms-under-section-40-of-the-COI-Act-2025-02-07-2026.pdf. Draft administrative mechanisms for the COI Act with unfilled notice details. Context only; not used as operative Track 2 scoring authority.

S14. USERS AND WORKFLOWS- COI (1).docx. Areas of Implementation and user stories cover DIALS, declarations/registers and complaints/investigations. Used to identify adjacent-track boundaries; those modules are excluded from the MVP.

S15. Public sector entities.docx. Heading identifies 22nd Cycle FY2025/2026. Reference institution categories only, not an asserted current 23rd Cycle enrollment list.

D01. Team deliberations in this task on 24 September 2026\. The user selected Track 2 and named the five team members. Earlier analysis identified scoring conflicts, scope boundaries and gaps. This PRD incorporates the later correction to use one configurable engine and one tested demo profile, plus a basic feedback loop. Suggested assignments and policies remain proposals until team review.

## **21.2 Online references**

All online references below were accessed on 24 September 2026\. Use the links to retrieve the underlying sources. Technical recommendations in this PRD are the team's proposed application of these references, not statements that the organizers mandate a particular standard.

W01. EACC, [Corruption Prevention Guidelines for the 23rd Cycle](https://eacc.go.ke/en/default/document/corruption-prevention-guidelines-for-the-23rd-cycle/). [Official PDF](https://eacc.go.ke/en/default/wp-content/uploads/2026/07/PERFORMANCE-CONTRACT-FOR-2026-2027-FINANCIAL-YEAR-.-23RD-CYCLE-CORRUPTION-PREVENTION-GUIDELINES-2.pdf). Live file matched S03 exactly. Publication presence and file equivalence verified; no claim that every later circular has been excluded.

W02. EACC, [Practical Guide for Corruption Risk Assessment and Management](https://eacc.go.ke/en/default/wp-content/uploads/2025/05/EACC-CRA-GUIDELINE-.pdf). Confirms availability of the guide linked by the cycle publication and its risk-management context.

W03. EACC, [Guidelines for Establishment and Operationalization of the Corruption Prevention Committee](https://eacc.go.ke/default/wp-content/uploads/2023/06/CPC-GUIDELINES-6.06.2023.pdf). Institutional governance and meeting evidence context.

W04. Office of the Data Protection Commissioner, [Rights of a Data Subject and Principles of Data Protection](https://www.odpc.go.ke/rights-of-a-data-subject/), supplemented by its [Guidelines index](https://www.odpc.go.ke/guidelines-2/). Supports privacy principles and identification of further public-sector and impact-assessment guidance; specific pilot obligations require organizational review.

W05. OWASP, [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). Supports least privilege, request-level permission checks and authorization testing.

W06. OWASP, [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Supports allowlists, content validation, filename safety, limits and protected storage.

W07. W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/). Basis for the proposed accessibility target and selected core-flow checks; no full conformance claim is made.

W08. EACC, [Model Procedures for Prevention of Bribery and Corruption](https://eacc.go.ke/en/default/wp-content/uploads/2025/03/Model-Procedures-for-Prevention-of-Bribery-and-Corruption.pdf). Generic procedure and compliance-checklist context, distinct from the institution-specific scanned adaptation.

## **21.3 Requirements to source and test map**

| Requirement group | Basis | Acceptance evidence |
| :---- | :---- | :---- |
| FR01 roles and assignments | S02, W05 | AT01, AT02, AT22 |
| FR02 calendar | S02, S03; proposed cutoffs | AT11, AT13 |
| FR03 dynamic publishing | S02; proposed version rules | AT03, AT04, AT05 |
| FR04 plan baseline | S03-S05; proposed scoring baseline | AT17 and denominator fixtures |
| FR05-FR07 reporting and evidence | S02, S03, W06 | AT06, AT07, AT09, AT21 |
| FR08 scoring | S02; Section 10 proposed rubric | AT08, AT15, AT16 and calculation suite |
| FR09-FR10 review | S02, S03, S07; D01 | AT08, AT09, AT10, AT20 |
| FR11 notifications | S02; proposed reliability rules | AT06, AT12, AT13 |
| FR12 oversight | S02, S07 | AT14, AT18, AT19 and coverage checks |
| FR13 annual reporting | S02; proposed aggregation and release | AT14-AT16, AT18-AT20 |
| FR14 simulation | S02 | AT13, AT24 |
| FR15 retrieval | S07, W05 | AT01, AT02 and scoped-search checks |
| FR16 interoperability | S01, S07; proposed contract | Export schema validation and trace-back test |
| UX and accessibility | S01, S02, W07; proposed target | AT23 and task observations |

# **22 Glossary**

| Term | Meaning in this PRD |
| :---- | :---- |
| Adili V3 | Wider challenge context containing the three tracks; this PRD covers Track 2 |
| EACC | Ethics and Anti-Corruption Commission |
| MDA | Ministry, Department or Agency; an institutional reporting entity in this workflow |
| PC | Performance Contract; the annual framework containing the corruption prevention indicator |
| CPC | Corruption Prevention Committee within an institution |
| IAO | Integrity Assurance Officer supporting institutional prevention work |
| CRA | Corruption Risk Assessment |
| CRAMP | Corruption Risk Assessment and Mitigation Plan; source materials also use CRMP for mitigation plan |
| PSPMU | Public Service Performance Management Unit named in the prevention presentation |
| Provisional score | Automated, versioned calculation based on submitted claims and supplied evidence |
| Reviewed score | Officer-finalized evaluation with criterion decisions and reasons |
| Published score | Reviewed result released through an explicit publication event |
| Foundation indicator | Proposed grouping for procedure, assessment and plan readiness |
| Milestone | A locked, objectively reviewable unit of planned implementation work |
| Tenant boundary | Separation of one institution's private data from another's |
| Idempotency | Repeating the same operation does not create duplicate business effects |
| P0 | Required for the agreed hackathon demonstration |
| P1 | Enhancement considered only after the core demonstration is reliable |

