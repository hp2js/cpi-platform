# DEMO-001 Evidence Pack: Demo Appointments Service Agency (DASA)

**Scenario (PRD §17.1):** Full foundation readiness and implementation trajectory, used in annual Example A (§10.6, acceptance test AT16). Assigned to **Officer A**.
**Expected annual result:** 10 + 15 + 15 + 60 × (0.50 + 0.75 + 1.00 + 1.00) ÷ 4 = **88.75**

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-001_F1_Procedures_…_v1.0.pdf | Procedure | 29 Sep 2026 (before 30 Sep foundation deadline) |
| 01_Foundations | DEMO-001_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 29 Sep 2026 |
| 01_Foundations | DEMO-001_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 29 Sep 2026 |
| 02_Q1 … 05_Q4 | DEMO-001_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 9 Oct 2026; Q2 14 Jan 2027; Q3 8 Apr 2027; Q4 9 Jul 2027 (all on time) |
| 02_Q1 … 05_Q4 | DEMO-001_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-001_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

In total there are 15 PDFs: 3 foundation documents plus 3 per quarter. Each quarterly submission follows the 23rd Cycle rule that the progress report is accompanied only by the signed CPC and IAO minutes. `DEMO-001_seed_fixture.json` holds the baseline, the expected decisions and the SHA-256 hash of each file.

## Foundation checks (all 12 accepted, giving 40 points)

| Indicator | Check | Where it is supported |
|---|---|---|
| Procedures (10) | Institutional identity and scope | F1 §1.0 |
| | Prevention procedure content | F1 §2.0–3.9 |
| | Approval details | F1 cover and §5.0 (Board Res. DASA/BD/RES/2026/031, 28 Aug 2026, signed) |
| | Designated implementation responsibility | F1 §4.0 (Designated Senior Officer, CPC, IAO Committee, enforcement structure) |
| Risk assessment (15) | Coverage of core and support functions | F2 §2.0 |
| | Identified risks and causes | F2 §4.0 register (R-01 to R-10, with risk sources) |
| | Probability and impact on declared scale | F2 §3.0 scales and §4.0 Pr × Im |
| | Existing controls and assessment context | F2 §1.0, §4.0 last column, §6.0 |
| Mitigation plan (15) | Link to identified risks | F3 §1.0 risk column |
| | Strategies and activities | F3 §1.0 (A-01 to A-04) |
| | Outputs and KPIs | F3 §1.0 |
| | Responsibility, resources and timeframe | F3 §1.0 and §2.0 named cohorts |

## Locked quarterly baseline and outcomes

There are four milestones per quarter, each with weight 1. M-01 and M-02 are DEMO-001's own milestones. M-03 (CPC meeting) and M-04 (IAO meeting) are the baseline obligations that apply to every institution.

| Quarter | M-01 Register + exception review | M-02 Training (named cohort) | M-03 CPC | M-04 IAO | I(q) | Snapshot 40 + 60·I |
|---|---|---|---|---|---|---|
| Q1 | ✗ Go-live slipped to 5 Oct; no review | ✗ Cohort A postponed | ✓ 24 Sep | ✓ 17 Sep | 2/4 = 0.50 | 70.00 |
| Q2 | ✗ Register live, but review done 13 Jan (after quarter end) | ✓ Cohort B, 26 Nov | ✓ 15 Dec | ✓ 8 Dec | 3/4 = 0.75 | 85.00 |
| Q3 | ✓ Review DASA/IA/ER/…/Q3, 10 Mar | ✓ Cohort C, 18 Feb | ✓ 19 Mar | ✓ 12 Mar | 4/4 = 1.00 | 100.00 |
| Q4 | ✓ Review DASA/IA/ER/…/Q4, 9 Jun | ✓ Cohort D, 20 May | ✓ 18 Jun | ✓ 11 Jun | 4/4 = 1.00 | 100.00 |

The evidence passages for each milestone are as follows. M-01 is supported by MIN. CPC/05 and MIN. IAO/03. M-02 is supported by MIN. CPC/06 and MIN. IAO/04, which list the trained staff numbers. M-03 and M-04 are each supported by the signed minutes as a whole, including the signature page.

DEMO-001 reports honestly, so the provisional and reviewed results are equal in every quarter. The late Q1 training (15 Oct) and the late Q2 exception review (13 Jan) appear only as corrective progress. They are never claimed, so they never earn credit twice, which matches §10.4.

## Assumptions to confirm with the team

The first assumption is that M-01 and M-02 recur every quarter, with M-02 tied to the cohort named for that quarter in F3 §2.0. A four-milestone denominator in every quarter is needed to produce Example A's fractions of 0.50, 0.75, 1.00 and 1.00.

The second assumption concerns AT32, the §3.3 worked case (Q1 claims 4/4, the reviewer accepts 3/4, and the annual result is 96.25). The PRD calls this "a separate calculation variant," so this pack does not implement it. That variant is in `Test Docs Variants/DEMO-001_AT32_Worked_Case_96.25` and is loaded in its own simulation run, never alongside this pack.

Allocation counts in the minutes run from one report's cut-off to the next, not by calendar quarter. The Q4 minutes and report therefore describe the 8 March to 6 June 2027 window as following the Q3 cut-off of 7 March.
