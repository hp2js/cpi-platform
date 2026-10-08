# DEMO-008 Evidence Pack: Demo Land Records Office (DLRO)

**Scenario:** PRD §17.1, assignment change and controlled post-publication correction. Acceptance tests AT20 (correct published decision) and AT22 (reassign officer), with the access rules in PRD §5 and the correction route in PRD §7.4.
**Published v1 (superseded):** 10 + 15 + 15 + 60 × (1.00 + 0.75 + 0.75 + 1.00) ÷ 4 = **92.50** (Q2 M-06 rejected).
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

The foundation documents are unchanged and all 12 foundation checks are accepted, giving 40 points. `DEMO-008_seed_fixture.json` holds the baseline, claims, decision history (including the superseded Q2 M-06 decision), assignment history, access checks, correction case, both publication versions and the SHA-256 hash of each file. PDFs are generated deterministically, so hashes are stable on rebuild.

## Locked baseline (DLRO/ABC/CRMP/2026-27/v1.0, F3 §3.0)

Each quarter has two planned milestones plus that quarter's CPC and IAO meetings as committee obligations (weight 1 each). Milestone IDs are unique across the year.

| Quarter | Planned milestones | Committee obligations |
|---|---|---|
| Q1 | M-01 Change log enabled and reviewed (A-01, R-01); M-02 Staff trained on the corruption prevention procedure (A-02, named staff in F3 §2.0) | M-03 CPC, M-04 IAO |
| Q2 | M-05 Change log enabled and reviewed: quarter 2 exception review (A-01, R-01 Unrecorded changes to land records); M-06 Procurement approval spot-check completed (A-03, R-02 Weak oversight of procurement approvals) | M-07 CPC, M-08 IAO |
| Q3 | M-09 Change log … quarter 3 exception review (A-01); M-10 Procurement approval spot-check completed (A-03) | M-11 CPC, M-12 IAO |
| Q4 | M-13 Change log … quarter 4 exception review (A-01); M-14 Procurement approval spot-check completed (A-03) | M-15 CPC, M-16 IAO |

Evidence expectations: change-log reviews need a minutes or progress-report passage recording the review; spot-checks need the findings in the CPC minutes.

## Quarterly baseline: claims versus review

| Quarter | Reviewer | Change-log exception review | Second planned milestone | CPC | IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|---|
| Q1 | Officer B | M-01 ✓ Enabled 2 Sep; review 17 Sep | M-02 ✓ 8 named staff, 9 Sep | M-03 ✓ 24 Sep | M-04 ✓ 22 Sep | 1.00 | 1.00 |
| Q2 | Officer B | M-05 ✓ Review 27 Nov | M-06 claimed ✓; **rejected in v1, accepted in v2** (8 of 12 checked on 3 Dec; all 12 completed 10 Dec) | M-07 ✓ 15 Dec | M-08 ✓ 3 Dec | 1.00 | v1 **0.75** → v2 **1.00** |
| *1 Mar 2027* | *Administrator reassigns DEMO-008 from Officer B to Officer A* | | | | | | |
| Q3 | Officer A | M-09 ✗ Reported Not achieved (review done 6 Apr, after quarter end) | M-10 ✓ 14 approvals, 4 Mar | M-11 ✓ 18 Mar | M-12 ✓ 11 Mar | 0.75 | 0.75 |
| Q4 | Officer A | M-13 ✓ Review 4 Jun | M-14 ✓ 15 approvals, 28 May | M-15 ✓ 17 Jun | M-16 ✓ 10 Jun | 1.00 | 1.00 |

## Demo walkthrough

1. **Q2 review by Officer B (22 Jan 2027).** The Q2 report claims M-06 and cites both sets of minutes. The IAO minutes (3 Dec, MIN. IAO/04) are interim: 8 of 12 sampled approvals checked, 4 files awaited. The later CPC minutes (15 Dec, MIN. CPC/06) record the spot-check completed on 10 Dec, with findings for all 12 approvals. The plan names the CPC minutes as the evidence for this milestone. Officer B reads only the IAO passage, rejects M-06 as "fewer than ten" and finalises I2 = 0.75. This is a reviewer error, not an institutional one.
2. **Assignment change (1 Mar 2027, AT22).** The administrator reassigns DEMO-008 to Officer A and records a reason. Show that Officer B now gets a denial on the DEMO-008 API, the submission and an evidence download. Officer A sees the full history, and Q1 and Q2 decisions still name Officer B as reviewer. Officer A was denied before 1 Mar.
3. **Q3 and Q4 by Officer A.** Q3 M-09 is honestly reported Not achieved. The 6 Apr review appears as corrective progress in the Q4 minutes and earns no credit in Q4 either. Officer A records the final foundation disposition at cutoff (2 Aug 2027).
4. **Publication v1 (16 Aug 2027).** The administrator publishes the batch. DEMO-008 sees 92.50 and the Q2 M-06 rejection reason in its own released report only.
5. **Correction (AT20).** On 18 Aug the focal person queries the decision through the portal, citing MIN. CPC/06/Q2. On 19 Aug the administrator opens correction case CC-DEMO-008-01 with a reason. On 20 Aug **Officer A**, the current assignee, records corrected decision D2 (accepted) against the originally submitted CPC minutes. Officer B's attempt to record a correction is denied. On 23 Aug the administrator publishes v2 = 96.25. v1 stays accessible, marked superseded, with decision D1 and Officer B's authorship intact. Only DEMO-008 is notified.
6. **Trace:** R-02 → A-03 → Q2 M-06 → Q2 submission revision → MIN. IAO/04 (D1, rejected, Officer B) → MIN. CPC/06 (D2, accepted, Officer A, CC-DEMO-008-01) → I2 0.75 → 1.00 → publication v1 92.50 (superseded) → v2 96.25.

## Notes

No extra evidence file is needed. The correction rests on a passage in the CPC minutes that was already part of the original Q2 submission, which keeps the pack within the minutes-only evidence rule. The institution's query, the correction case and the reassignment are system records, held in the fixture rather than as uploads.

The provisional annual (96.25) matches v2 because the Q2 M-06 claim was always supported and the Q3 M-09 shortfall was never claimed. It also happens to equal DEMO-006's score, but it is reached by a different path.
