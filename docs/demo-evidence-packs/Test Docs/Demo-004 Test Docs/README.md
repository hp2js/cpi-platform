# DEMO-004 Evidence Pack: Demo Revenue Collection Agency (DRCA)

**Scenarios:**
- PRD §17.1, "Unsupported completion claim reduced by officer review", in Q1 (§10.6 Example C, AT08).
- **Denominator gaming**, in the Q2 baseline proposal (§10.7, AT31).

The assigned officer is Officer A.

**Expected annual result:** 10 + 15 + 15 + 60 × (0.75 + 0.50 + 1.00 + 1.00) ÷ 4 = **88.75**.
**Provisional annual result, before review:** 92.50 (Q1 = 1.00). The entity sees only the published 88.75.
**If the inflated Q2 baseline had been activated:** 93.75. Q2 would be 10/12 instead of 2/4, adding +5.00 that was never earned.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-004_F1_Procedures_…_v1.0.pdf | Procedure | 25 Sep 2026 |
| 01_Foundations | DEMO-004_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 25 Sep 2026 |
| 01_Foundations | DEMO-004_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan (also the Q1 baseline, §3.0) | 25 Sep 2026 |
| 03_Q2 … 05_Q4 | DEMO-004_Qn_Baseline_Proposal.pdf | Baseline proposal (input to the officer's baseline review, not quarterly evidence) | Q2 22 Sep 2026; Q3 15 Dec 2026; Q4 17 Mar 2027 |
| 02_Q1 … 05_Q4 | DEMO-004_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 6 Oct 2026; Q2 12 Jan 2027; Q3 9 Apr 2027; Q4 8 Jul 2027 (all on time) |
| 02_Q1 … 05_Q4 | DEMO-004_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1 … 05_Q4 | DEMO-004_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |

All 12 foundation checks are accepted, giving 40 points. `DEMO-004_seed_fixture.json` holds the following:
- the baselines and proposals, including the eight inflation rows and the expected officer decision;
- the claimed and expected reviewed decisions;
- the Q1 clarification record;
- the counterfactual scores;
- the SHA-256 hash of each file.

## Quarterly baselines: claims versus review

| Quarter | Locked baseline | Substantive milestones | Committee obligations | Provisional I | Reviewed I |
|---|---|---|---|---|---|
| Q1 | M-01 to M-04 (F3 §3.0) | M-01 matrix approved and applied: claimed ✓, **rejected**. M-02 training of 14 named staff: ✓ 22–23 Sep | M-03 CPC ✓ 29 Sep; M-04 IAO ✓ 28 Sep | 4/4 = 1.00 | **3/4 = 0.75** |
| Q2 | M-05 to M-08 (12 proposed, **4 activated**) | M-05 exception review: ✗ honestly reported. M-06 spot-check: ✗ only 6 of 10 | M-07 CPC ✓ 17 Dec; M-08 IAO ✓ 14 Dec | 2/4 = 0.50 | **2/4 = 0.50** |
| Q3 | M-09 to M-12 | M-09 exception review ✓ 12 Mar. M-10 spot-check ✓ 12 approvals, 1 finding | M-11 CPC ✓ 18 Mar; M-12 IAO ✓ 15 Mar | 1.00 | 1.00 |
| Q4 | M-13 to M-16 | M-13 exception review ✓ 11 Jun. M-14 spot-check ✓ 10 approvals, no findings | M-15 CPC ✓ 17 Jun; M-16 IAO ✓ 14 Jun | 1.00 | 1.00 |

## Q1: the unsupported claim

1. The Q1 report claims that "all 17 write-offs processed in Q1 complied with the matrix". It cites MIN. CPC/05 and MIN. IAO/03 as evidence.
2. Those minutes show only that the matrix was approved on 5 Aug 2026. MIN. CPC/05/Q1 records that the compliance check "has not yet been carried out", and that no compliance result was presented. M-02 (MIN. CPC/06, MIN. IAO/04 and Annex 1), M-03 and M-04 are supported.
3. The officer requests clarification on M-01. No supporting response arrives within the 7-day window. After the 31 Jul 2027 cutoff, the officer records M-01 = 0 with a reason, giving I1 = 0.75.
4. MIN. CPC/03/Q2 later reports that the late Q1 check found only 15 of 17 write-offs compliant. This is corrective progress (§10.4). It confirms the rejection and must not trigger a re-review of Q1.

## Q2: denominator gaming (AT31)

1. **Proposal (22 Sep 2026, before Q2 opens).** `DEMO-004_Q2_Baseline_Proposal.pdf` lists 12 milestones. Eight of them (M-20 to M-27: circulate notice, book room, print agenda, and so on) sit under a new activity A-99, Administrative tasks, nominally linked to R-01. A-99 has no output, KPI or budget, and it is a requested amendment, not part of approved plan v1.0.
2. **Officer baseline review.** The 12-milestone proposal cannot activate until the officer resolves the artificial fragmentation.
   - The officer rejects M-20 to M-27, with this reason: they are trivial secretariat steps split out of the committee obligations, and A-99 is not in the approved plan and mitigates no material risk.
   - The officer records material coverage: R-01 through M-05, R-02 through M-06, plus the two committee obligations.
   - The officer then activates M-05 to M-08.
   - The rejected rows stay in the record. Nothing is silently reweighted.
3. **What the gaming would have achieved.** The institution honestly reports M-05 and M-06 as not achieved: the exception review didn't happen, and only 6 of the required 10 approvals were checked (MIN. CPC/05 and CPC/06/Q2). It does complete the meetings and all eight admin tasks (MIN. CPC/09/Q2, "Secretariat matters").
   - Locked baseline: **2/4 = 50.00%**, a Q2 snapshot of 70.00.
   - Inflated baseline: **10/12 = 83.33%**, a Q2 snapshot of 90.00.

   These are the PRD §10.7 numbers. Committee obligations would also shrink from half of the denominator to one sixth.
4. **Claims outside the baseline (FR04).** Section B2 of the Q2 report still claims M-20 to M-27 as achieved and asks for credit. The system must award nothing for them, because they are not in the locked baseline.
5. MIN. CPC/03/Q3 reports that both Q2 items were completed in January 2027. That is after the quarter ended, so there is no Q2 credit and no re-review.

Comparison views should show plan size beside the score: 4 activated milestones per quarter, with 12 proposed in Q2.

## Notes

- **Plan alignment.** F2 and F3 are aligned with the quarterly baselines. A-01 is restrict write-off authority (matrix in Q1, exception reviews in Q2–Q4). A-02 is training (Q1 only, 14 named staff in F3 §2.0). A-03 is procurement approval spot-checks (Q2–Q4). R-01 is manual penalty write-offs and R-02 is weak oversight of procurement approvals. The CPC and IAO meetings are committee obligations rather than plan activities, and are added to every proposal.
- **Evidence rules.** Exception reviews are evidenced by a minutes or report passage. Spot-check findings are recorded in the CPC minutes (MIN. CPC/06), as the baselines require.
- **Baseline proposals.** These are not quarterly evidence under the minutes-only rule. Use them as the input for the officer's baseline review, or seed their rows directly from the JSON.
