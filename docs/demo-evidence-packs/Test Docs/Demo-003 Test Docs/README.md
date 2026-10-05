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

All 12 foundation checks are accepted, giving 40 points. `DEMO-003_seed_fixture.json` holds the baseline, the claimed and expected reviewed decisions, the timeliness fields (`submitted_at`, `on_time`, `days_late`) and the SHA-256 hash of each file.

## Quarterly baseline: claims versus review

Every milestone ID in this pack is unique across the year (M-01 to M-21). The plan's activities fall due in different quarters, so the denominator differs by quarter.

| Quarter | Milestones | Provisional I | Reviewed I | Timeliness |
|---|---|---|---|---|
| Q1 | M-01 schedule 94.2% · M-02 training 14/14 · M-03 CPC 24 Sep · M-04 IAO 22 Sep | 4/4 = 1.00 | 1.00 | **Late, 2 days** |
| Q2 | M-05 schedule 93.1% · M-06 cashless 37/37 · M-07 COI declarations 214/214 · M-08 CPC 17 Dec · M-09 IAO 14 Dec | 5/5 = 1.00 | 1.00 | On time |
| Q3 | M-10 schedule 92.7% · M-11 online 85.2% · M-12 reconciliation 50/50 · M-13 procurement 15/15 · M-14 recruitment 5/5 · M-15 CPC 18 Mar · M-16 IAO 16 Mar | 7/7 = 1.00 | 1.00 | On time |
| Q4 | M-17 schedule 93.3% · M-18 access control · M-19 work tickets 84/84 · M-20 CPC 17 Jun · M-21 IAO 15 Jun | 5/5 = 1.00 | 1.00 | On time |

## The Q1 late submission (demo walkthrough)

1. Advance the simulated clock past **15 Oct 2026 23:59:59**. The Q1 obligation becomes overdue, and the 1-day-before and overdue reminders fire once each.
2. Submit the three Q1 files at **17 Oct 2026 11:20:00**. The receipt records them as Late, 2 days, with first-submission time and first-complete-evidence time both 17 Oct 11:20.
3. The progress report's §3 explains the cause honestly: the Accounting Officer was travelling from 12 to 16 Oct, and she confirmed the CPC minutes on 16 Oct. That explanation does not remove the flag.
4. The officer accepts all four Q1 milestones. The meeting was held on 24 Sep, inside the quarter, even though the Chair signed afterwards; PRD §16.1 calls this case "document received late that proves on-time completion".
5. The annual report shows 100.00, Q1 late, and penalty not configured. On the supervisor dashboard, DEMO-003 counts 4/4 for submission coverage and 3/4 for on-time reporting.

For the optional AT11 boundary check, a rehearsal run should classify 15 Oct 23:59:59 as on time and 16 Oct 00:00:00 as late.

## Notes

The Q2 CPC minutes record the corrective action taken after Q1: a written alternate signatory and an earlier internal draft date. In Q3, an anonymous report is recorded without any details. This is context only; it is not a finding and has no effect on scoring.

Each quarter is submitted with only the progress report and the two sets of signed minutes. Supporting records named in the minutes, such as inspection schedules, registers and review reports, are clarification-only.

Period-based conditions have measurement windows that close before that quarter's IAO meeting, on 11 Dec, 12 Mar and 11 Jun. The plan was approved on 19 Jun 2026, so every quarter's baseline is activated live before the quarter opens, and no SEEDED HISTORICAL BASELINE is needed.
