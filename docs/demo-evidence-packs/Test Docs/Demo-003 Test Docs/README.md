# DEMO-003 Evidence Pack: Demo County Licensing Office (DCLO)

**Scenario:** PRD §17.1, late submission with an explicit timeliness flag. Related tests: AT11 (deadline boundary) and Example E in §10.6. Assigned to **Officer A**.
**Expected annual result:** 10 + 15 + 15 + 60 × (1.00 + 1.00 + 1.00 + 1.00) ÷ 4 = **100.00**, with the Q1 report flagged **Late (2 days), penalty not configured in demo**.
**Provisional annual result, before review:** 100.00. Lateness does not change the achievement score; it is shown separately.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time, Africa/Nairobi)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-003_F1_Procedures_…_v1.0.pdf | Procedure | 21 Sep 2026 (deadline 30 Sep) |
| 01_Foundations | DEMO-003_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 21 Sep 2026 |
| 01_Foundations | DEMO-003_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 21 Sep 2026 |
| 02_Q1 … 05_Q4 | DEMO-003_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 **17 Oct 2026 11:20 (late)**; Q2 12 Jan 2027; Q3 9 Apr 2027; Q4 8 Jul 2027 (on time) |
| 02_Q1 … 05_Q4 | DEMO-003_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-003_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

All 12 foundation checks are accepted, giving 40 points. `DEMO-003_seed_fixture.json` holds the baseline (including each milestone's evidence expectation), the claimed and expected reviewed decisions, the timeliness fields (`submitted_at`, `on_time`, `days_late`) and the SHA-256 hash of each file.

## Plan structure (F2 and F3)

| Risk | Score | Activity | Scored milestones |
|---|---|---|---|
| R-01 Discretionary licence inspections | 4 × 5 = 20 | A-01 Publish an inspection schedule (Q1 adherence; Q2–Q4 exception review) | M-01, M-05, M-09, M-13 |
| R-01 | | A-02 Train staff in affected functions (Q1) | M-02 |
| R-02 Weak oversight of procurement approvals | 3 × 5 = 15 | A-03 Spot-check procurement approvals (Q2–Q4) | M-06, M-10, M-14 |
| R-03 to R-08 | 12 or lower | Monitoring only in FY 2026/27; reassessed for FY 2027/28 | — |
| All identified risks | | Committee obligation, added to every quarter | M-03/04, M-07/08, M-11/12, M-15/16 |

## Quarterly baseline: claims versus review

| Quarter | Inspection schedule (A-01) | Procurement spot-check (A-03) | CPC | IAO | Provisional I | Reviewed I | Timeliness |
|---|---|---|---|---|---|---|---|
| Q1 | M-01 published 1 Jul; 49/52 = 94.2% · M-02 training 14/14 | — | M-03 24 Sep | M-04 22 Sep | 4/4 | 1.00 | **Late, 2 days** |
| Q2 | M-05 review 4 Dec: 3 deviations, 1 exception recorded | M-06 12 sampled; 2 exceptions recorded | M-07 17 Dec | M-08 14 Dec | 4/4 | 1.00 | On time |
| Q3 | M-09 review 5 Mar: 0 exceptions; Q2 finding closed | M-10 10 sampled (the minimum); 1 exception | M-11 18 Mar | M-12 16 Mar | 4/4 | 1.00 | On time |
| Q4 | M-13 review 4 Jun: 0 exceptions | M-14 14 sampled; 0 exceptions; Q3 finding closed | M-15 17 Jun | M-16 15 Jun | 4/4 | 1.00 | On time |

The exception-review and spot-check milestones are met once the review or check is completed and its findings recorded. A finding of exceptions does not make the milestone incomplete. The officer should accept M-05, M-06 and M-10 even though they record exceptions. M-10 tests the boundary of "at least ten", with exactly 10 sampled. Spot-check findings are tabulated in the CPC minutes, as the baseline's evidence expectation requires; the IAO minutes repeat them.

## The Q1 late submission (demo walkthrough)

1. Advance the simulated clock past **15 Oct 2026 23:59:59**. The Q1 obligation becomes overdue, and the 1-day-before and overdue reminders fire once each.
2. Submit the three Q1 files at **17 Oct 2026 11:20:00**. The receipt records them as Late, 2 days, with first-submission time and first-complete-evidence time both 17 Oct 11:20.
3. The progress report's §3 explains the cause honestly: the Accounting Officer was travelling from 12 to 16 Oct, and she confirmed the CPC minutes on 16 Oct. That explanation does not remove the flag.
4. The officer accepts all four Q1 milestones. The meeting was held on 24 Sep, inside the quarter, even though the Chair signed afterwards; PRD §16.1 calls this case "document received late that proves on-time completion".
5. The annual report shows 100.00, Q1 late, and penalty not configured. On the supervisor dashboard, DEMO-003 counts 4/4 for submission coverage and 3/4 for on-time reporting.

For the optional AT11 boundary check, a rehearsal run should classify 15 Oct 23:59:59 as on time and 16 Oct 00:00:00 as late.

## Notes

The Q2 CPC minutes record the corrective action taken after the late Q1 report: a written alternate signatory. In Q3, an anonymous report is recorded without any details. This is context only; it is not a finding and has no effect on scoring.

Each quarter is submitted with only the progress report and the two sets of signed minutes. The exception review reports (DCLO/IA/EXR/…) and spot-check working papers (DCLO/CPC/SPC/…) are clarification-only.

Every quarter's baseline is approved before the quarter opens. The plan was approved on 19 Jun 2026, so no SEEDED HISTORICAL BASELINE is needed.
