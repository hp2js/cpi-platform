# DEMO-004 Evidence Pack: Demo Revenue Collection Agency (DRCA)

**Scenario:** PRD §17.1, "Unsupported completion claim reduced by officer review" (see also §10.6 Example C and AT08). The assigned officer is Officer A.
**Expected annual result:** 10 + 15 + 15 + 60 × (0.75 + 1.00 + 1.00 + 1.00) ÷ 4 = **96.25**. Q1 contributes 60 × 0.75 ÷ 4 = 11.25.
**Provisional annual result, before review:** 100.00. The entity never sees this number. It sees only the published 96.25.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-004_F1_Procedures_…_v1.0.pdf | Procedure | 25 Sep 2026 |
| 01_Foundations | DEMO-004_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 25 Sep 2026 |
| 01_Foundations | DEMO-004_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 25 Sep 2026 |
| 02_Q1 … 05_Q4 | DEMO-004_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 6 Oct 2026; Q2 12 Jan 2027; Q3 9 Apr 2027; Q4 8 Jul 2027 (all on time) |
| 02_Q1 … 05_Q4 | DEMO-004_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-004_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

The foundation documents are unchanged and all 12 foundation checks are accepted, giving 40 points. `DEMO-004_seed_fixture.json` holds the baseline, the training cohorts, the claimed and expected reviewed decisions, the Q1 clarification record and the SHA-256 hash of each file.

## Quarterly baseline: claims versus review

| Quarter | M-01 Matrix approved and write-offs comply | M-02 Training | M-03 CPC | M-04 IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|
| Q1 | Claimed ✓; **rejected** | ✓ Cohort A (14), 22–23 Sep | ✓ 29 Sep | ✓ 28 Sep | 4/4 = 1.00 | **3/4 = 0.75** |
| Q2 | ✓ 21/21 checked 11 Dec | ✓ Cohort B (12), 18–19 Nov | ✓ 17 Dec | ✓ 14 Dec | 1.00 | 1.00 |
| Q3 | ✓ 15/15 checked 12 Mar | ✓ Cohort C (10), 23–24 Feb | ✓ 18 Mar | ✓ 15 Mar | 1.00 | 1.00 |
| Q4 | ✓ 19/19 checked 11 Jun | ✓ Cohort D (10), 18–19 May | ✓ 17 Jun | ✓ 14 Jun | 1.00 | 1.00 |

## The Q1 unsupported claim (demo walkthrough)

1. The Q1 progress report (Section A row 1, Section B) claims all four milestones. It states that "all 17 write-offs processed in Q1 complied with the matrix" and cites MIN. CPC/05 and MIN. IAO/03 as evidence.
2. Those minutes support only half of the completion condition. They show that the matrix was approved on 5 Aug 2026. However, MIN. CPC/05/Q1 records that **the compliance check of the 17 write-offs "has not yet been carried out"**, and that no compliance result was presented. MIN. IAO/03/Q1 says the same. The minutes do support M-02 (MIN. CPC/06 and MIN. IAO/04 with Annex 1, giving all 14 Cohort A staff numbers), M-03 and M-04.
3. The officer accepts M-02, M-03 and M-04. On M-01, the officer requests clarification, asking for evidence that all Q1 write-offs complied with the matrix.
4. No supporting response arrives within the 7-day window. After the evaluation cutoff of 31 Jul 2027, the officer records M-01 = 0 with a reason and finalises I1 = 0.75. The provisional value of 1.00 stays in the decision history. There is no partial credit for "approved but not verified" (§10.4).
5. Trace: R-01 → A-01 → M-01 → Q1 submission revision → CPC/IAO minutes passage → rejected criterion decision → I1 = 0.75 → annual publication of 96.25.

## Difference from DEMO-001: the Q2 corrective follow-up

MIN. CPC/03/Q2/2026-27 and the Q2 report (Section A, row 1, emerging issues) record the late Q1 check, completed on 21 Oct 2026. It found that **15 of the 17** Q1 write-offs complied. Two were approved above the approver's threshold and were later ratified.

This is corrective progress (§10.4). It confirms that the Q1 condition was not met, so it must **not** trigger a re-review of Q1 M-01 to 1. It also earns nothing in Q2, because Q2's M-01 is judged only on Q2 write-offs. Use it to show that later information is visible in the record but does not alter Q1 credit. It is a control exception, not an allegation of fraud.

## Notes

The pack contains no clarification-response file, because in this scenario the institution does not substantiate the claim.

M-01 and M-02 recur every quarter, and M-02 is tied to the cohort named for that quarter in F3 §2.0. From Q2, write-off approvals close on the 10th day of the quarter's last month (F3 activity A-01(d)). That lets each quarter's compliance check cover every write-off before the CPC meets.
