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

The foundation documents are unchanged during the year and all 12 foundation checks are accepted, giving 40 points. `DEMO-002_seed_fixture.json` holds the baseline, the claimed and expected reviewed decisions, both Q1 revisions, the Q1 clarification record and the SHA-256 hash of each file.

## Quarterly baseline: claims versus review

Each quarter has four milestones of weight 1: two planned mitigation milestones plus the quarter's CPC and IAO meetings, which are added to every quarter as committee obligations. Every milestone has its own identifier (M-01 to M-16).

| Quarter | Mitigation milestone 1 | Mitigation milestone 2 | CPC | IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|
| Q1 Rev 1 | M-01 waiver second approvals: evidence **declared not available** | M-02 training ✓ (15 + 21 Sep) | M-03 ✓ 25 Sep | M-04: evidence **declared not available** | 2/4 = 0.50 | not finalized |
| Q1 Rev 2 | M-01 ✓ 23 of 23 granted | M-02 ✓ (carried forward) | M-03 ✓ (carried forward) | M-04 ✓ 22 Sep | 4/4 = 1.00 | **1.00** |
| Q2 | M-05 exception review ✓ 14 Dec (0 control exceptions; 2 repeat waivers justified) | M-06 spot-check ✓ 12 approvals, 2 exceptions | M-07 ✓ 17 Dec | M-08 ✓ 15 Dec | 1.00 | 1.00 |
| Q3 | M-09 exception review ✓ 15 Mar (0 control exceptions; 1 repeat waiver justified) | M-10 spot-check ✓ 10 approvals, 1 exception | M-11 ✓ 19 Mar | M-12 ✓ 16 Mar | 1.00 | 1.00 |
| Q4 | M-13 exception review ✓ 14 Jun (no exceptions) | M-14 spot-check ✓ 11 approvals, no exceptions | M-15 ✓ 18 Jun | M-16 ✓ 15 Jun | 1.00 | 1.00 |

Where each Q2–Q4 milestone is evidenced:
- **Exception review (M-05, M-09, M-13):** MIN. IAO/03 and MIN. CPC/05 record the review reference, date, tests and result. Section A row 1 of the progress report also records it, which satisfies "minutes or progress report passage".
- **Procurement spot-check (M-06, M-10, M-14):** MIN. CPC/06 records the sample size, population and findings, as the evidence expectation requires. The IAO minutes (MIN. IAO/04) only adopt the working papers for the CPC.
- **CPC and IAO meetings:** the signed minutes and their signature pages.

Spot-check findings are recorded honestly, including exceptions. A milestone is met when at least ten approvals were checked and the findings recorded; it does not require zero exceptions. Q3 confirms that the Q2 corrective actions held, and Q4 confirms the Q3 fix.

## The Q1 missing evidence and its correction (demo walkthrough)

1. The IAO Committee met on 22 Sep 2026 and verified the full Q1 waiver register (MIN. IAO/03). Waivers can be granted only at the monthly Waiver Approval Sitting, and the last Q1 sitting was 11 Sep. The rapporteur then went on leave until 15 Oct, so the minutes could not be confirmed.
2. At the CPC meeting on 25 Sep the Secretary gave only an **oral** report on the waiver verification (MIN. CPC/05), with no figures in writing. The CPC minutes do record the training with staff numbers (MIN. CPC/06).
3. **Revision 1 (9 Oct, AT07).** The report claims all four milestones but attaches only the CPC minutes. Section D declares the IAO minutes not available, with the reason. A receipt is issued with an *evidence incomplete* flag. M-01 and M-04 get no provisional credit, so provisional I1 = 0.50.
4. **Officer review (13 Oct).** The officer accepts M-02 (MIN. CPC/06) and M-03, and notes that MIN. CPC/05 cannot substantiate M-01 by itself. Clarification CLR-DEMO002-Q1-01 is issued on M-01 and M-04, due 20 Oct 23:59:59 EAT.
5. **Revision 2 (19 Oct, AT09).** The minutes were signed on 16 Oct and are now attached; Section E answers the clarification. The CPC minutes are referenced, not re-uploaded. Revision 1, its receipt and its declarations stay in history.
6. **Re-review.** The IAO minutes pass the period check because the meeting was within Q1; a signature date after quarter end does not change that. The officer accepts M-01 (23 granted, 23 with second approval, 1 declined) and M-04. The officer explicitly confirms the carried-forward M-02 and M-03 decisions and finalises I1 = 1.00.
7. Trace: R-01 → A-01 → M-01 → Q1 Rev 1 (declared missing) → clarification → Q1 Rev 2 → MIN. IAO/03 → accepted decision → I1 = 1.00 → annual publication of 100.00.

## Notes

Risk R-02 (weak oversight of procurement approvals) and activity A-03 (procurement spot-checks) appear in F2 and F3 so that the Q2–Q4 milestones trace back to the approved plan. Training (A-02) runs in Q1 only, for the eight staff named in F3 §2.0; one was absent on 15 Sep and trained at a make-up session on 21 Sep, still before quarter end. The IAO Committee meets before the CPC in every quarter, as the CPC Guidelines expect, although the baseline condition only requires each committee to meet during the quarter.

To demonstrate AT10, try finalising Revision 1 after Revision 2 has arrived; the result should be a version conflict.
