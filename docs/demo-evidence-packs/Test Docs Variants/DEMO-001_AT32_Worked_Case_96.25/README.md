# DEMO-001 Evidence Pack: Demo Appointments Service Agency (DASA)

**Scenario:** the PRD §3.3 worked case, acceptance test AT32. Assigned to **Officer A**.

> **Separate simulation run.** This is a calculation variant of DEMO-001 (PRD §3.3). It uses the same institution ID as the canonical DEMO-001 pack in `Test Docs/Demo-001 Test Docs` (Example A, 88.75), so it must be loaded in its own labelled simulation run and never alongside the main eight-institution set. The §17.1 scenario "unsupported completion claim reduced by officer review" is covered in the main set by DEMO-004.
**Expected annual result:** 10 + 15 + 15 + 60 × (0.75 + 1.00 + 1.00 + 1.00) ÷ 4 = **96.25**. Q1 contributes 60 × 0.75 ÷ 4 = 11.25.
**Provisional annual result, before review:** 100.00. The entity never sees this number. It sees only the published 96.25.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-001_F1_Procedures_…_v1.0.pdf | Procedure | 29 Sep 2026 |
| 01_Foundations | DEMO-001_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 29 Sep 2026 |
| 01_Foundations | DEMO-001_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 29 Sep 2026 |
| 02_Q1 … 05_Q4 | DEMO-001_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 9 Oct 2026; Q2 14 Jan 2027; Q3 8 Apr 2027; Q4 9 Jul 2027 (all on time) |
| 02_Q1 … 05_Q4 | DEMO-001_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-001_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

The foundation documents are unchanged and all 12 foundation checks are accepted, giving 40 points. `DEMO-001_seed_fixture.json` holds the baseline, the claimed and expected reviewed decisions, the Q1 clarification record and the SHA-256 hash of each file.

## Quarterly baseline: claims versus review

| Quarter | M-01 Register + exception review | M-02 Training | M-03 CPC | M-04 IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|
| Q1 | Claimed ✓; **rejected** | ✓ Cohort A, 10 Sep | ✓ 24 Sep | ✓ 17 Sep | 4/4 = 1.00 | **3/4 = 0.75** |
| Q2 | ✓ Review 4 Dec | ✓ Cohort B, 26 Nov | ✓ 15 Dec | ✓ 8 Dec | 1.00 | 1.00 |
| Q3 | ✓ Review 10 Mar | ✓ Cohort C, 18 Feb | ✓ 19 Mar | ✓ 12 Mar | 1.00 | 1.00 |
| Q4 | ✓ Review 9 Jun | ✓ Cohort D, 20 May | ✓ 18 Jun | ✓ 11 Jun | 1.00 | 1.00 |

## The Q1 unsupported claim (demo walkthrough)

1. The Q1 progress report (Section A row 1, Section B) claims all four milestones. It states that Internal Audit completed the Q1 exception review on 29 Sep 2026 and cites MIN. CPC/05 and MIN. IAO/03 as evidence.
2. Those minutes support only part of the claim. They show the register live from 7 Sep 2026, with 2,610 allocations logged. They also state that **no exception review report was presented or considered**, because both meetings took place before 29 Sep. The minutes do support M-02 (MIN. CPC/06 and MIN. IAO/04, with staff numbers), M-03 and M-04.
3. The officer accepts M-02, M-03 and M-04 and requests clarification on M-01, asking for evidence that the review was completed by 30 Sep 2026.
4. No supporting response arrives within the 7-day window. After the evaluation cutoff of 31 Jul 2027, the officer records M-01 = 0 with a reason and finalises I1 = 0.75. The provisional value of 1.00 stays in the decision history.
5. Trace: R-01 → A-01 → M-01 → Q1 submission revision → CPC/IAO minutes passage → rejected criterion decision → I1 = 0.75 → annual publication of 96.25.

## Notes

The pack contains no clarification-response file, because in this scenario the institution does not substantiate the claim. To demonstrate the alternative branch, a timely response proving the review would trigger a re-review and a recalculation to 100.00. That branch would need an extra evidence file, which the team should agree with the organiser given the minutes-only evidence rule.

M-01 and M-02 recur every quarter, and M-02 is tied to the cohort named for that quarter in F3 §2.0.

Allocation counts in the minutes run from one report's cut-off to the next, not by calendar quarter. The Q3 and Q4 minutes and reports describe their windows as following the previous cut-off (30 November 2026 and 7 March 2027).
