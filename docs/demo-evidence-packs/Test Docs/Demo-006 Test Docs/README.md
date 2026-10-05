# DEMO-006 Evidence Pack: Demo Roads Development Authority (DRDA)

**Scenario:** PRD §17.1 — *Future plan amendment that preserves prior denominator.* Exercises FR04, §10.4 (amendment rules), §10.3 (foundation version validity), acceptance test AT17 and the §16.1 calculation test "amendment effective dates". Assigned to **Officer B**.
**Expected annual result:** 10 + 15 + 15 + 60 × (1.00 + 0.75 + 1.00 + 0.80) ÷ 4 = **93.25**.
**Provisional annual result, before review:** 93.25. Every claim in this pack is honest, so provisional and reviewed values match; the scenario tests the *denominator*, not unsupported claims.

Everything here is synthetic. The institution, people, staff numbers, contracts, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-006_F1_Procedures_…_v1.0.pdf | Procedure | 28 Sep 2026 |
| 01_Foundations | DEMO-006_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 28 Sep 2026 |
| 01_Foundations | DEMO-006_F3_…_Mitigation_Plan_FY2026-27.pdf (**v1.0**) | Mitigation plan | 28 Sep 2026 |
| 02_Q1 … 05_Q4 | DEMO-006_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 8 Oct 2026; Q2 13 Jan 2027; Q3 8 Apr 2027; Q4 9 Jul 2027 (all on time) |
| 02_Q1 … 05_Q4 | DEMO-006_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-006_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |
| 04_Q3 | DEMO-006_Q3_Plan_Amendment_Request_AMR-01_Original.pdf | Plan amendment request (rev 1) | 20 Jan 2027 |
| 04_Q3 | DEMO-006_Q3_Plan_Amendment_Request_AMR-01_Revised.pdf | Plan amendment request (rev 2) | 22 Mar 2027 |
| 04_Q3 | DEMO-006_F3_…_Mitigation_Plan_FY2026-27_**v1.1**.pdf | Mitigation plan (new version) | 22 Mar 2027 |

The three amendment files are the only additions compared with the DEMO-001 pack. They sit in `04_Q3` because the amendment is requested, declined, revised and approved while Q3 is the open period. `DEMO-006_seed_fixture.json` holds the plan versions, both amendment revisions with expected officer decisions, the per-quarter baselines and denominators, the negative checks, the expected annual result and the SHA-256 hash of each file.

## Locked baselines by quarter

| Quarter | Plan version | M-01 Independent review of each variation | M-02 Training | M-03 CPC | M-04 IAO | M-05 Reconciliation | Reviewed I |
|---|---|---|---|---|---|---|---|
| Q1 | v1.0 | ✓ 2 of 2 VOs reviewed | ✓ Cohort A, 9 Sep | ✓ 23 Sep | ✓ 16 Sep | — | 4/4 = **1.00** |
| Q2 | v1.0 | **✗ 2 of 3** (VO-2026-14 none) | ✓ Cohort B, 24 Nov | ✓ 17 Dec | ✓ 10 Dec | — | 3/4 = **0.75** |
| Q3 | v1.0 | ✓ 2 of 2 | ✓ Cohort C, 17 Feb | ✓ 18 Mar | ✓ 11 Mar | — | 4/4 = **1.00** |
| Q4 | **v1.1** | ✓ 3 of 3 | ✓ Cohort D, 19 May | ✓ 24 Jun | ✓ 17 Jun | **✗** signed 6 Jul | 4/5 = **0.80** |

## The amendment (demo walkthrough)

1. **Q2 miss, honestly declared.** Emergency variation VO-2026-14 (KES 18.4m) was approved on 2 Dec 2026 without an independent review record. The Q2 report claims 3 of 4 and the minutes (MIN. CPC/05/Q2, MIN. IAO/03/Q2) confirm it. Officer B finalises I2 = 0.75.
2. **AT17 attempt (scripted).** During Q3 the entity tries to delete Q2 M-01 or mark it not applicable. The system blocks it, keeps the Q2 denominator at 4 and points to the amendment path.
3. **Amendment request rev 1 (20 Jan 2027).** It asks to (1) mark Q2 M-01 not applicable or reschedule it to Q3, and (2–3) add an emergency review route and a new milestone M-05 from Q3. Officer B declines on 27 Jan 2027. Item 1 is retrospective. Items 2–3 target Q3, which opened on 1 Jan 2027, so the earliest effective period is Q4. The officer also checks that M-05 is a distinct payment-side control for R-02 and not an artificial split of M-01.
4. **Corrective progress, no double credit.** The retrospective review of VO-2026-14 (IVRP/2027/03, 15 Feb 2027) appears in Q3 as corrective progress. It does not change Q2 and is not counted as a Q3 variation.
5. **Revision 2 + Plan v1.1 (22 Mar 2027).** The CPC withdraws the rejected items (MIN. CPC/07/Q3) and the AO approves v1.1 on 19 Mar 2027, effective 1 Apr 2027 for Q4 only. Officer B confirms the Q4 baseline (5 milestones) on 25 Mar 2027, before Q4 opens. Uploading v1.1 does not by itself change any baseline; the officer confirmation is a separate record.
6. **Q4 under the new denominator.** M-05 is honestly declared not achieved because the reconciliation was signed on 6 Jul 2027, after quarter end. I4 = 4/5 = 0.80, and the late reconciliation stays visible as corrective progress.
7. **Annual.** Mitigation-plan foundation uses v1.1, the version effective at the 31 Jul 2027 cutoff. All 4 checks are accepted, so 15 points. Annual = **93.25**.
8. **Trace:** R-01 → A-01 → Q2 M-01 (rejected, retained) → AMR-01 rev 1 (declined) → rev 2 + v1.1 → Q4 baseline v1.1 → R-02 → A-05 → Q4 M-05 → I4 = 0.80 → annual publication of 93.25.

## Results that must NOT appear

| Error | Result |
|---|---|
| Q2 M-01 removed retrospectively (Q2 = 3/3) | 97.00 |
| Amendment ignored, Q4 scored on old baseline (Q4 = 4/4) | 96.25 |
| Both errors | 100.00 |

## Notes

The Q2 review decision and the officer's amendment decisions are system records in the fixture, not uploaded files. The revised request (22 Mar) cites CPC minutes signed on 19 Mar that are uploaded with the Q3 report on 8 Apr; the AO approval block in v1.1 is enough for the officer's 25 Mar confirmation.

M-01 and M-02 recur every quarter, and M-02 is tied to the cohort named for that quarter in F3 §2.0 (unchanged in v1.1).
