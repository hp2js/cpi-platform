# DEMO-007 Evidence Pack: Demo Education Bursary Fund (DEBF)

**Scenario:** PRD §17.1 DEMO-007, uploaded evidence for the wrong period, corrected by a new version. Assigned to Officer B.
**Acceptance tests exercised:** AT30 (evidence suitability), AT09 (clarification and revised evidence), AT27 (decision invalidation and carry-forward) and AT10 (finalize obsolete revision).
**Expected annual result:** 10 + 15 + 15 + 60 × (1.00 + 1.00 + 1.00 + 1.00) ÷ 4 = **100.00**. The result stays pending until Q2 is finalized against revision 2.
**Alternative branch (no timely response):** Q2 M-06 = 0 and M-07 = 0, so I2 = 0.50 and the annual result is **92.50**.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-007_F1_Procedures_…_v1.0.pdf | Procedure | 28 Sep 2026 |
| 01_Foundations | DEMO-007_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 28 Sep 2026 |
| 01_Foundations | DEMO-007_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan (holds the baseline) | 28 Sep 2026 |
| 02_Q1, 04_Q3, 05_Q4 | DEMO-007_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 8 Oct 2026; Q3 9 Apr 2027; Q4 8 Jul 2027 (all on time) |
| 02_Q1, 04_Q3, 05_Q4 | DEMO-007_Qn_CPC_Minutes_Signed.pdf | Signed CPC minutes | with that quarter's report |
| 02_Q1, 04_Q3, 05_Q4 | DEMO-007_Qn_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | with that quarter's report |
| 03_Q2/r1_submitted_2027-01-13 | DEMO-007_Q2_Implementation_Progress_Report_AppendixV.pdf | Progress report, revision 1 | 13 Jan 2027 11:00 (on time) |
| 03_Q2/r1_submitted_2027-01-13 | DEMO-007_Q2_CPC_Minutes_Signed.pdf **(wrong period)** | Signed CPC minutes | 13 Jan 2027 11:00 |
| 03_Q2/r1_submitted_2027-01-13 | DEMO-007_Q2_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | 13 Jan 2027 11:00; carried forward to revision 2 |
| 03_Q2/r2_submitted_2027-01-22 | DEMO-007_Q2_Implementation_Progress_Report_AppendixV_rev2.pdf | Progress report, revision 2 | 22 Jan 2027 14:30 |
| 03_Q2/r2_submitted_2027-01-22 | DEMO-007_Q2_CPC_Minutes_Signed.pdf (correct) | Signed CPC minutes, new evidence version | 22 Jan 2027 14:30 |

Both Q2 CPC files have the **same file name** but different content and SHA-256 hashes. The system should treat the second as a new evidence version, not an overwrite. The IAO minutes are not re-uploaded in revision 2; the same evidence version is referenced again.

The foundation documents are unchanged, and all 12 foundation checks are accepted, giving 40 points. `DEMO-007_seed_fixture.json` holds:
- the baseline for every quarter;
- both Q2 revisions;
- the suitability checklists;
- the draft and final decisions, with their dependencies;
- the clarification record;
- the SHA-256 hash of each file.

## Plan baseline (F3 §3.0)

Milestone IDs are unique across the year. The quarter's CPC and IAO meetings are committee obligations added to every quarter.

| Qtr | Milestone | Activity / risk | Completion condition | Evidence expectation |
|---|---|---|---|---|
| Q1 | M-01 Award criteria and results published | A-01 / R-01 | Criteria were published before awards, and results after, for the quarter. | Minutes |
| Q1 | M-02 Staff trained on the corruption prevention procedure | A-02 / R-01 | Training delivered to the staff named in the plan by quarter end. | Minutes |
| Q1 | M-03 CPC, M-04 IAO | Committee obligations | Committee met in the quarter; minutes signed. | Signed minutes |
| Q2 | M-05 Award criteria and results published: quarter 2 exception review | A-01 / R-01 Favouritism in bursary awards | An exception review of the control was completed and recorded by the end of Q2. | Minutes or progress report passage |
| Q2 | M-06 Procurement approval spot-check completed | A-03 / R-02 Weak oversight of procurement approvals | A sample of at least ten approvals was checked in Q2 and findings recorded. | Spot-check findings in the CPC minutes |
| Q2 | M-07 CPC, M-08 IAO | Committee obligations / all identified risks | The CPC / the IAOs met during the quarter. | Signed minutes |
| Q3 | M-09 exception review, M-10 spot-check, M-11 CPC, M-12 IAO | as Q2 | as Q2, by the end of Q3 | as Q2 |
| Q4 | M-13 exception review, M-14 spot-check, M-15 CPC, M-16 IAO | as Q2 | as Q2, by the end of Q4 | as Q2 |

## Quarterly baseline: claims versus review

| Quarter | Mitigation milestone 1 | Mitigation milestone 2 | CPC | IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|
| Q1 | M-01 ✓ 15 Jul < 2 Sep < 9 Sep | M-02 ✓ Cohort A, 3 Sep | M-03 ✓ 22 Sep | M-04 ✓ 14 Sep | 1.00 | 1.00 |
| Q2 rev 1 | M-05 ✓ review 14 Dec (IAO minutes) | M-06 claimed; **clarification** | M-07 claimed; **clarification** | M-08 ✓ 15 Dec | 1.00 | not final |
| Q2 rev 2 | M-05 ✓ carried forward | M-06 ✓ 12 approvals, findings at CPC | M-07 ✓ 18 Dec | M-08 ✓ carried forward | 1.00 | **1.00** |
| Q3 | M-09 ✓ review 8 Mar | M-10 ✓ 10 approvals, 1 finding | M-11 ✓ 18 Mar | M-12 ✓ 10 Mar | 1.00 | 1.00 |
| Q4 | M-13 ✓ review 2 Jun | M-14 ✓ 11 approvals, no findings | M-15 ✓ 17 Jun | M-16 ✓ 8 Jun | 1.00 | 1.00 |

## The Q2 wrong-period evidence (demo walkthrough)

1. **Revision 1 (13 Jan 2027, on time).** The report claims M-05 to M-08 and cites `DEBF/CPC/MIN/Q2/2026-27`. The attached CPC file is a genuine DEBF document, but it is the signed minutes of the **15 December 2025** meeting (`DEBF/CPC/MIN/Q2/2025-26`, FY 2025/2026). It was picked up because it had the same file name. Provisional I2 = 1.00, because every claim has a file of the right category and provisional scoring does not judge period.
2. **Suitability checklist (AT30).** On the CPC file, Officer B records institution match **Pass**, period match **Deficient**, relevance **Deficient**, signature **Pass** and readability **Pass**. The reason is recorded as an evidence deficiency, not an allegation of fraud. The file stays on record as uploaded.
3. **Criterion decisions.**
   - **M-05 accepted.** MIN. IAO/03 (15 Dec 2026) records the exception review completed on 14 Dec.
   - **M-08 accepted.** It rests on the IAO minutes.
   - **M-06 cannot be substantiated.** Its evidence must be spot-check findings in the CPC minutes. The IAO minutes only say the findings will go to the CPC.
   - **M-07 cannot be substantiated.** There are no Q2 FY 2026/27 CPC minutes.
4. **Clarification CLR-DEMO-007-Q2-01** covers M-06 and M-07. It is issued and notified at 10:15 on 19 Jan 2027 and is due by 23:59:59 on 26 Jan 2027.
5. **Revision 2 (22 Jan 2027, timely).** Every claim is unchanged. The correct minutes of 18 Dec 2026 (signed 21 Dec 2026) are attached under the same file name, and the IAO minutes carry forward.
   - Revision 1, its receipt and its files stay intact (AT09).
   - The first-submission time stays 13 Jan, which is on time.
   - The first-complete-evidence time is 22 Jan. It is shown as a separate field, with no penalty.
6. **Dependency effects (AT27).** M-06 and M-07 relied on the replaced CPC slot, so both become **Needs re-review**. M-05 and M-08 relied only on the unchanged IAO file. They carry forward only after Officer B explicitly confirms them against revision 2.
7. **Optional AT10 check.** Trying to finalize against revision 1 now returns a version conflict.
8. **Finalization (27 Jan 2027).** Reviewed I2 = 1.00.
   - **M-06 accepted** on MIN. CPC/06/Q2: 12 approvals were checked and the findings recorded. This is a document received after the deadline that proves on-time completion.
   - **M-07 accepted** on the CPC signature page.
9. **Trace:** R-02 → A-03 → M-06 → Q2 revision 1 → wrong-period evidence version → suitability deficiency → clarification → revision 2 → new evidence version and passage MIN. CPC/06 → accepted decision → I2 = 1.00 → annual publication of 100.00.

## Notes

The correction stays within the minutes-only evidence rule (PRD §9.2). The replacement file is the set of CPC minutes the report already cited, so no extra evidence category needs organizer agreement. M-05's baseline also allows a progress-report passage as evidence, but the scenario does not rely on it, because the IAO minutes support M-05 on their own.

The Q3 CPC minutes (MIN. CPC/03/Q3) and the Q3 report record the error and the corrective step: a file naming rule with financial year and meeting date, and a pre-submission attachment check. This is the institution's own follow-up and has no effect on scoring.
