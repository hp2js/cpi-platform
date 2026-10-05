# DEMO-002 Evidence Pack: Demo Water Services Board (DWSB)

**Scenario:** PRD §17.1, missing evidence followed by clarification and correction. Acceptance tests AT07 and AT09.
**Expected annual result:** 10 + 15 + 15 + 60 × (1.00 + 1.00 + 1.00 + 1.00) ÷ 4 = **100.00**. Q1 contributes 60 × 1.00 ÷ 4 = 15.00.
**Q1 Revision 1, before correction:** provisional I1 = 2/4 = 0.50, giving a Q1 snapshot of 70.00. This stays in the decision history after Revision 2 supersedes it.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-002_F1_Procedures_…_v1.0.pdf | Procedure | 29 Sep 2026 |
| 01_Foundations | DEMO-002_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 29 Sep 2026 |
| 01_Foundations | DEMO-002_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 29 Sep 2026 |
| 02_Q1 | DEMO-002_Q1_Implementation_Progress_Report_AppendixV_Rev1.pdf | Progress report | Rev 1, 9 Oct 2026 (on time) |
| 02_Q1 | DEMO-002_Q1_CPC_Minutes_Signed.pdf | Signed CPC minutes | Rev 1, 9 Oct 2026; referenced again by Rev 2 |
| 02_Q1 | DEMO-002_Q1_Implementation_Progress_Report_AppendixV_Rev2.pdf | Progress report | Rev 2, 19 Oct 2026 |
| 02_Q1 | DEMO-002_Q1_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | **Rev 2 only**, 19 Oct 2026 |
| 03_Q2 … 05_Q4 | DEMO-002_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q2 14 Jan 2027; Q3 13 Apr 2027; Q4 13 Jul 2027 (all on time) |
| 03_Q2 … 05_Q4 | DEMO-002_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 03_Q2 … 05_Q4 | DEMO-002_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

The foundation documents are unchanged and all 12 foundation checks are accepted, giving 40 points. `DEMO-002_seed_fixture.json` holds the baseline, the claimed and expected reviewed decisions, both Q1 revisions, the Q1 clarification record and the SHA-256 hash of each file.

## Quarterly baseline: claims versus review

| Quarter | M-01 Waiver second approvals | M-02 Training | M-03 CPC | M-04 IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|
| Q1 Rev 1 | Claimed ✓; evidence **declared not available** | ✓ Cohort A, 15 + 21 Sep | ✓ 25 Sep | Claimed ✓; evidence **declared not available** | 2/4 = 0.50 | not finalized |
| Q1 Rev 2 | ✓ 23 of 23 granted | ✓ (carried forward) | ✓ (carried forward) | ✓ 22 Sep | 4/4 = 1.00 | **1.00** |
| Q2 | ✓ 29 of 29 granted | ✓ Cohort B, 19 Nov | ✓ 17 Dec | ✓ 14 Dec | 1.00 | 1.00 |
| Q3 | ✓ 26 of 26 granted | ✓ Cohort C, 17 Feb | ✓ 19 Mar | ✓ 16 Mar | 1.00 | 1.00 |
| Q4 | ✓ 22 of 22 granted | ✓ Cohort D, 20 May | ✓ 18 Jun | ✓ 15 Jun | 1.00 | 1.00 |

## The Q1 missing evidence and its correction (demo walkthrough)

1. The IAO Committee met on 22 Sep 2026 and verified the full Q1 waiver register (MIN. IAO/03). Waivers can be granted only at the monthly Waiver Approval Sitting, and the last Q1 sitting was 11 Sep. The rapporteur then went on leave until 15 Oct, so the minutes could not be confirmed.
2. At the CPC meeting on 25 Sep the Secretary gave only an **oral** report on the waiver verification (MIN. CPC/05), with no figures in writing. The CPC minutes do record Cohort A training with staff numbers (MIN. CPC/06).
3. **Revision 1 (9 Oct, AT07).** The report claims all four milestones but attaches only the CPC minutes. Section D declares the IAO minutes not available, with the reason. A receipt is issued with an *evidence incomplete* flag. M-01 and M-04 get no provisional credit, so provisional I1 = 0.50.
4. **Officer review (13 Oct).** The officer accepts M-02 (MIN. CPC/06) and M-03, and notes that MIN. CPC/05 cannot substantiate M-01 by itself. Clarification CLR-DEMO002-Q1-01 is issued on M-01 and M-04, due 20 Oct 23:59:59 EAT.
5. **Revision 2 (19 Oct, AT09).** The minutes were signed on 16 Oct and are now attached; Section E answers the clarification. The CPC minutes are referenced, not re-uploaded. Revision 1, its receipt and its declarations stay in history.
6. **Re-review.** The IAO minutes pass the period check because the meeting was within Q1; a signature date after quarter end does not change that. The officer accepts M-01 (23 granted, 23 with second approval, 1 declined) and M-04. The officer explicitly confirms the carried-forward M-02 and M-03 decisions and finalises I1 = 1.00.
7. Trace: R-01 → A-01 → M-01 → Q1 Rev 1 (declared missing) → clarification → Q1 Rev 2 → MIN. IAO/03 → accepted decision → I1 = 1.00 → annual publication of 100.00.

## Notes

M-01 and M-02 recur every quarter, and M-02 is tied to the cohort named for that quarter in F3 §2.0. In Q1 one Cohort A member was absent on 15 Sep and trained at a make-up session on 21 Sep, still before quarter end. M-04 requires the IAO Committee to meet before the CPC, and it does so in every quarter.

To demonstrate AT10, try finalising Revision 1 after Revision 2 has arrived; the result should be a version conflict.
