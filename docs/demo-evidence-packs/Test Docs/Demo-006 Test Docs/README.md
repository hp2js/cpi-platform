# DEMO-006 Evidence Pack: Demo Roads Development Authority (DRDA)

**Scenario:** PRD §17.1, *Future plan amendment that preserves prior denominator.* It exercises FR04, §7.1 (an active period keeps its assigned version), §10.4 (amendment rules), §10.3 (foundation version validity), acceptance test AT17 and the §16.1 calculation test "amendment effective dates". Assigned to **Officer B**.
**Expected annual result:** 10 + 15 + 15 + 60 × (1.00 + 0.75 + 1.00 + 1.00) ÷ 4 = **96.25**.
**Provisional annual result, before review:** 96.25. Every claim is honest, so provisional and reviewed values match. The scenario tests the *denominator*, not unsupported claims. (DEMO-008's corrected result is also 96.25, but by a different route: a published Q2 decision corrected after publication, with a Q3 shortfall.)

Everything here is synthetic. The institution, people, staff numbers, contracts, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-006_F1_Procedures_…_v1.0.pdf | Procedure | 28 Sep 2026 |
| 01_Foundations | DEMO-006_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 28 Sep 2026 |
| 01_Foundations | DEMO-006_F3_…_Mitigation_Plan_FY2026-27.pdf (**v1.0**) | Mitigation plan | 28 Sep 2026 |
| 03_Q2 | DEMO-006_Q2_Plan_Amendment_Request_AMR-01.pdf | Plan amendment request | 18 Dec 2026 |
| 03_Q2 | DEMO-006_F3_…_Mitigation_Plan_FY2026-27_**v1.1**.pdf | Mitigation plan (new version) | 18 Dec 2026 |
| 02_Q1 … 05_Q4 | DEMO-006_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 8 Oct 2026; Q2 13 Jan 2027; Q3 8 Apr 2027; Q4 9 Jul 2027 (all on time) |
| 02_Q1 … 05_Q4 | DEMO-006_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-006_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

Compared with DEMO-001, the only extra files are the amendment request and Plan v1.1. They sit in `03_Q2` because the amendment is made while Q2 is the open period. `DEMO-006_seed_fixture.json` holds:

- both plan versions, with their effective periods;
- the superseded v1.0 definitions for Q3 and Q4;
- the amendment items and the expected officer decisions;
- each quarter's baseline activation record and milestones;
- the negative checks;
- the expected annual result and the SHA-256 hash of each file.

## Locked baselines and results

| Quarter | Plan | Planned milestones | Committee obligations | Reviewed I |
|---|---|---|---|---|
| Q1 | v1.0 | M-01 Independent review of each variation ✓ · M-02 Named staff trained ✓ (9 Sep) | M-03 CPC ✓ 23 Sep · M-04 IAO ✓ 16 Sep | 4/4 = **1.00** |
| Q2 | v1.0 | **M-05 Q2 exception review ✗** (completed 12 Jan 2027) · M-06 Spot-check ✓ (12 approvals, 1 Dec) | M-07 CPC ✓ 17 Dec · M-08 IAO ✓ 10 Dec | 3/4 = **0.75** |
| Q3 | v1.1 | M-09 Q3 exception review ✓ (16 Mar) · M-10 Spot-check ✓ (10 approvals, 9 Mar) | M-11 CPC ✓ 18 Mar · M-12 IAO ✓ 11 Mar | 4/4 = **1.00** |
| Q4 | v1.1 | M-13 Q4 exception review ✓ (21 Jun) · M-14 Spot-check ✓ (11 approvals, 10 Jun) | M-15 CPC ✓ 24 Jun · M-16 IAO ✓ 17 Jun | 4/4 = **1.00** |

## The amendment (demo walkthrough)

1. **The problem (Q2, open period).** Under v1.0 each exception review must cover *every* variation approved in the quarter, so Internal Audit can only finish the Q2 review in January. M-05 therefore cannot be met by 31 Dec. The Q2 spot-check findings also sit in an Internal Audit memo, which cannot accompany the report under the minutes-only rule (MIN. IAO/03 and IAO/05/Q2).
2. **AT17 attempt (scripted).** The entity tries to delete M-05 from the Q2 baseline, or mark it not applicable. The system blocks this and points to the amendment path.
3. **Amendment request AMR-01 and Plan v1.1 (18 Dec 2026).** The request has three items, approved by MIN. CPC/07/Q2:
   - **Item 1:** move Q2 M-05 into Q3. Q2 would drop to 3 milestones and Q3 would rise to 5.
   - **Item 2:** from Q3, set the exception-review cut-off at the 15th of the quarter's last month. The evidence can be *minutes or a progress-report passage*.
   - **Item 3:** from Q3, record spot-check findings *in the CPC minutes*.
4. **Officer B decision (22 Dec 2026).**
   - **Item 1 is rejected.** Q2 is the open period, so its locked baseline cannot change.
   - **Items 2 and 3 are confirmed for Q3 and Q4.** Milestone IDs, conditions, weights and denominators are unchanged; only how the work is done and evidenced changes.
   - **Baselines confirmed:** the Q3 baseline (M-09 to M-12) on 23 Dec and the Q4 baseline (M-13 to M-16) on 25 Mar, each before its quarter opens. CPC and IAO obligations are added to each proposal.
5. **Q2 report (13 Jan 2027).** M-05 is honestly declared not achieved, so I2 = 3/4. The prior denominator is preserved.
6. **No double credit (Q3).** The late Q2 review (12 Jan) and the retrospective review of VO-2026-14 (15 Feb) appear only as corrective progress. They earn neither Q2 M-05 nor any Q3 milestone.
7. **The amended rules in use.**
   - **M-09 and M-13** are evidenced by MIN. CPC/05 *and* by Section A row 1 of the progress report, which is labelled as the evidence passage.
   - **M-10 and M-14** findings are recorded in MIN. CPC/06.
8. **Annual.** The mitigation-plan foundation uses v1.1, the version effective at the 31 Jul 2027 cutoff. All 4 checks are accepted, giving 15 points. Annual = **96.25**.
9. **Trace:** R-01 → A-01 → M-05 (Q2, not achieved, retained) → AMR-01 item 1 (rejected) / items 2–3 (confirmed) → v1.1 → Q3 baseline M-09…M-12 → Q4 baseline M-13…M-16 → annual publication of 96.25.

## Results that must NOT appear

| Error | Result |
|---|---|
| Q2 M-05 deleted (Q2 = 3/3) | 100.00 |
| Q2 M-05 moved into Q3 and credited there with the 12 Jan review (Q2 = 3/3, Q3 = 5/5) | 100.00 |

## Notes

The officer decision and the baseline confirmations are system records in the fixture, not uploaded files. The v1.0 plan already shows the planned Q3 and Q4 milestones under their original evidence expectations, so a reviewer can compare v1.0 with v1.1 side by side. A-02 training is a one-off Q1 milestone: all 12 named staff were trained on 9 Sep 2026.
