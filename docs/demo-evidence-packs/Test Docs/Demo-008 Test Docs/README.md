# DEMO-008 Evidence Pack: Demo Land Records Office (DLRO)

**Scenario:** PRD §17.1, assignment change and controlled post-publication correction. Acceptance tests AT20 (correct published decision) and AT22 (reassign officer), with the access rules in PRD §5 and the correction route in PRD §7.4.
**Published v1 (superseded):** 10 + 15 + 15 + 60 × (1.00 + 0.75 + 0.75 + 1.00) ÷ 4 = **92.50**.
**Published v2 (current, after correction):** 10 + 15 + 15 + 60 × (1.00 + 1.00 + 0.75 + 1.00) ÷ 4 = **96.25**.
**Provisional annual result, before review:** 96.25. The entity never sees this number. It sees v1, then v2 with v1 marked superseded.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-008_F1_Procedures_…_v1.0.pdf | Procedure | 28 Sep 2026 |
| 01_Foundations | DEMO-008_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 28 Sep 2026 |
| 01_Foundations | DEMO-008_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 28 Sep 2026 |
| 02_Q1 … 05_Q4 | DEMO-008_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 8 Oct 2026; Q2 13 Jan 2027; Q3 7 Apr 2027; Q4 8 Jul 2027 (all on time) |
| 02_Q1 … 05_Q4 | DEMO-008_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-008_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

The foundation documents are unchanged and all 12 foundation checks are accepted, giving 40 points. `DEMO-008_seed_fixture.json` holds the baseline, claims, decision history (including the superseded Q2 M-02 decision), assignment history, access checks, correction case, both publication versions and the SHA-256 hash of each file. PDFs are generated deterministically, so hashes are stable on rebuild.

## Locked baseline (DLRO/ABC/CRMP/2026-27/v1.0, F3 §3.0)

| Milestone | Activity | Completion condition |
|---|---|---|
| M-01 Change log enabled and reviewed | A-01 Introduce change logs for record edits | The change log is enabled and was reviewed by quarter end. |
| M-02 Staff trained on the corruption prevention procedure | A-02 Train staff in affected functions | Training delivered to the staff named in the plan by quarter end (Cohort A–D in F3 §2.0). |
| M-03 Quarterly CPC meeting held | A-03 | Baseline obligation for every institution |
| M-04 Quarterly IAO Committee meeting held | A-04 | Baseline obligation for every institution |

## Quarterly baseline: claims versus review

| Quarter | Reviewer | M-01 Change log + review | M-02 Training | M-03 CPC | M-04 IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|---|
| Q1 | Officer B | ✓ Enabled 2 Sep; review 17 Sep | ✓ Cohort A, 9 Sep | ✓ 24 Sep | ✓ 22 Sep | 1.00 | 1.00 |
| Q2 | Officer B | ✓ Review 27 Nov | Claimed ✓; **rejected in v1, accepted in v2** (8/9 on 25 Nov + make-up 9 Dec) | ✓ 15 Dec | ✓ 3 Dec | 1.00 | v1 **0.75** → v2 **1.00** |
| *1 Mar 2027* | *Administrator reassigns DEMO-008 from Officer B to Officer A* | | | | | | |
| Q3 | Officer A | ✗ Reported Not achieved (review done 6 Apr, after quarter end) | ✓ Cohort C, 17 Feb | ✓ 18 Mar | ✓ 11 Mar | 0.75 | 0.75 |
| Q4 | Officer A | ✓ Review 4 Jun | ✓ Cohort D, 19 May | ✓ 17 Jun | ✓ 10 Jun | 1.00 | 1.00 |

## Demo walkthrough

1. **Q2 review by Officer B (22 Jan 2027).** The Q2 report claims M-02 and cites both sets of minutes. The IAO minutes (3 Dec, MIN. IAO/04) record only 8 of 9 named staff trained, with a make-up session *scheduled*. The later CPC minutes (15 Dec, MIN. CPC/06) record DLRO/STF/1221 trained at the make-up session on 9 Dec, so all 9 were trained. Officer B reads only the IAO passage, rejects M-02 with a reason and finalises I2 = 0.75. This is a reviewer error, not an institutional one.
2. **Assignment change (1 Mar 2027, AT22).** The administrator reassigns DEMO-008 to Officer A and records a reason. Show that Officer B now gets a denial on the DEMO-008 API, the submission and an evidence download. Officer A sees the full history, and Q1 and Q2 decisions still name Officer B as reviewer. Officer A was denied before 1 Mar.
3. **Q3 and Q4 by Officer A.** Q3 M-01 is honestly reported Not achieved. The 6 Apr review appears as corrective progress in the Q4 minutes and earns no double credit. Officer A records the final foundation disposition at cutoff (2 Aug 2027).
4. **Publication v1 (16 Aug 2027).** The administrator publishes the batch. DEMO-008 sees 92.50 and the Q2 M-02 rejection reason in its own released report only.
5. **Correction (AT20).** On 18 Aug the focal person queries the decision through the portal, citing MIN. CPC/06/Q2. On 19 Aug the administrator opens correction case CC-DEMO-008-01 with a reason. On 20 Aug **Officer A**, the current assignee, records corrected decision D2 (accepted) against the originally submitted CPC minutes. Officer B's attempt to record a correction is denied. On 23 Aug the administrator publishes v2 = 96.25. v1 stays accessible, marked superseded, with decision D1 and Officer B's authorship intact. Only DEMO-008 is notified.
6. **Trace:** R-01 → A-02 → Q2 M-02 → Q2 submission revision → MIN. IAO/04 (D1, rejected, Officer B) → MIN. CPC/06 (D2, accepted, Officer A, CC-DEMO-008-01) → I2 0.75 → 1.00 → publication v1 92.50 (superseded) → v2 96.25.

## Notes

No extra evidence file is needed. The correction rests on a passage in the CPC minutes that was already part of the original Q2 submission, which keeps the pack within the minutes-only evidence rule. The institution's query, the correction case and the reassignment are system records, held in the fixture rather than as uploads.

The provisional annual (96.25) matches v2 because the Q2 claim was always supported and the Q3 shortfall was never claimed. It also happens to equal DEMO-001's published score, but it is reached by a different path.
