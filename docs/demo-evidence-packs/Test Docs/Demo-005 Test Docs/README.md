# DEMO-005 Evidence Pack: Demo Referral Hospital Board (DRHB)

**Scenario:** PRD §17.1 "Missing Q3 and foundation partial credit used in annual example B" (§10.6 example B; acceptance tests AT14 and AT15). Assigned to **Officer B**.
**Expected annual result:** 10 × 1 + 15 × 0.75 + 15 × 1 + 60 × (0.50 + 0.75 + 0 + 1.00) ÷ 4 = 36.25 + 33.75 = **70.00**.
**Before Q3 is closed:** the annual result is **pending**, not 70.00, and publication is blocked. No renormalisation over Q1, Q2 and Q4.

Everything here is synthetic. The institution, people, suppliers, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-005_F1_Procedures_…_v1.0.pdf | Procedure | 29 Sep 2026 |
| 01_Foundations | DEMO-005_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 29 Sep 2026 |
| 01_Foundations | DEMO-005_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 29 Sep 2026 |
| 02_Q1, 03_Q2, 05_Q4 | DEMO-005_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 8 Oct 2026; Q2 13 Jan 2027; Q4 12 Jul 2027 (all on time) |
| 02_Q1, 03_Q2, 05_Q4 | DEMO-005_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1, 03_Q2, 05_Q4 | DEMO-005_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |
| 04_Q3 | *(none)* | — | **No submission.** The folder holds only a do-not-upload note. |

`DEMO-005_seed_fixture.json` holds the baseline, per-check foundation decisions, claimed and expected reviewed milestone decisions, the Q3 notification and nonresponse record, and the SHA-256 hash of each file.

## Foundations: partial credit (40 → 36.25)

| Indicator | Checks accepted | Fraction | Points |
|---|---|---|---|
| Procedures | 4/4 | 1.00 | 10.00 |
| Risk assessment | 3/4. **Check 3 "probability and impact on declared scale" fails**: F2 §3.0 states P and I were not scored and §4.0 gives only a qualitative risk level | 0.75 | 11.25 |
| Mitigation plan | 4/4 | 1.00 | 15.00 |

The institution discloses the limitation itself and does not claim check 3, so provisional and reviewed R are both 0.75. The officer records the rejected check with the F2 §3.0 passage as the reason.

## Quarterly baseline (locked per quarter; CPC and IAO meetings added to every quarter)

| Quarter | Planned milestone 1 | Planned milestone 2 | CPC | IAO | I (prov. = reviewed) |
|---|---|---|---|---|---|
| Q1 | **M-01** Rotation used for quarterly order: ✗ order of 14 Aug went to one supplier; list not yet approved | **M-02** Named staff trained: ✗ 9 of 12 | **M-03** ✓ 22 Sep | **M-04** ✓ 15 Sep | **0.50** |
| Q2 | **M-05** Q2 exception review of rotation control: ✓ completed 3 Dec, no exceptions | **M-06** Spot-check ≥10 approvals: ✗ only 8 checked | **M-07** ✓ 14 Dec | **M-08** ✓ 7 Dec | **0.75** |
| Q3 | **M-09** Q3 exception review | **M-10** Q3 spot-check | **M-11** | **M-12** | missing → **0** after closure |
| Q4 | **M-13** Q4 exception review: ✓ completed 28 May, no exceptions | **M-14** Spot-check: ✓ 12 checked, findings in CPC minutes | **M-15** ✓ 15 Jun | **M-16** ✓ 3 Jun | **1.00** |

Activities: A-01 Introduce supplier rotation (R-01 Irregular procurement of medical supplies), A-02 Train staff in affected functions (Q1 only), A-03 Spot-check procurement approvals (R-02 Weak oversight of procurement approvals). CPC and IAO milestones are committee obligations covering all identified risks.

Q1 and Q2 claims are honest: unachieved milestones are reported as *Not achieved*, citing the minute that records their status. Two threshold cases show that partial completion earns 0: M-02 (9 of 12 named staff) and M-06 (8 of at least 10 approvals). Late corrective progress is visible in later minutes but earns no credit twice: the training make-up on 21 Oct, and the last two Q2 spot-check items on 19 Jan. Spot-check findings appear in the CPC minutes (MIN. CPC/06), as the M-06/M-10/M-14 evidence rule requires. Exception reviews appear in both sets of minutes (MIN. CPC/05, MIN. IAO/03).

## The missing Q3 (demo walkthrough)

1. Q3 opens on 1 Jan 2027 with a locked 4-milestone baseline. No report is submitted by 15 Apr 2027. Reminders go out on 8 Apr and 14 Apr, and an overdue notice on 16 Apr.
2. Officer B issues a nonresponse notice on 19 Apr 2027 with a 7-day window to 26 Apr. No response arrives.
3. **Before disposition:** generate the annual report. DEMO-005 shows as **pending**, publication is blocked (AT14 behaviour), and no 70.00 or renormalised figure such as 36.25 + 60 × 2.25 ÷ 3 = 81.25 appears.
4. The Q4 report (12 Jul 2027) explains the gap in MIN. CPC/03/Q4 and Section E, and claims no Q3 milestone (M-09 to M-12). It must not be treated as a Q3 submission.
5. **After the 31 Jul 2027 cutoff:** Officer B closes Q3 for nonresponse with I3 = 0 and a reason (AT15). The annual result becomes **70.00**.
6. Trace: R-01 → A-01 → M-01 / M-05 / M-09 / M-13 and R-02 → A-03 → M-06 / M-10 / M-14 → per-quarter decisions → I = 0.50 / 0.75 / 0 / 1.00 → F2 §3.0 rejected check → R = 0.75 → published 70.00.

## Quarterly readiness snapshots (internal, labelled)

Q1 36.25 + 30 = 66.25; Q2 36.25 + 45 = 81.25; Q3 pending, then 36.25 after closure; Q4 36.25 + 60 = 96.25. The annual score uses foundations once and is **not** the average of these snapshots.
