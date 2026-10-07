# DEMO-007 Evidence Pack: Demo Education Bursary Fund (DEBF)

**Scenario:** PRD §17.1 DEMO-007, uploaded evidence for the wrong period, corrected by a new version. Assigned to Officer B.
**Acceptance tests exercised:** AT30 (evidence suitability), AT09 (clarification and revised evidence), AT27 (decision invalidation and carry-forward), AT10 (finalize obsolete revision).
**Expected annual result:** 10 + 15 + 15 + 60 × (1.00 + 1.00 + 1.00 + 1.00) ÷ 4 = **100.00**. The result stays pending until Q2 is finalized against revision 2.
**Alternative branch (no timely response):** Q2 M-01 = 0 and M-03 = 0, so I2 = 0.50 and the annual result is **92.50**.

Everything here is synthetic. The institution, people, staff numbers, signatures and events are fictional, and every address uses `example.invalid`.

## Files and when to upload them (simulated time)

| Folder | File | Category | Simulated upload |
|---|---|---|---|
| 01_Foundations | DEMO-007_F1_Procedures_…_v1.0.pdf | Procedure | 28 Sep 2026 |
| 01_Foundations | DEMO-007_F2_…_Risk_Assessment_Report_FY2026-27.pdf | Risk assessment | 28 Sep 2026 |
| 01_Foundations | DEMO-007_F3_…_Mitigation_Plan_FY2026-27.pdf | Mitigation plan | 28 Sep 2026 |
| 02_Q1, 04_Q3, 05_Q4 | DEMO-007_Qn_Implementation_Progress_Report_AppendixV.pdf | Progress report | Q1 8 Oct 2026; Q3 9 Apr 2027; Q4 8 Jul 2027 (all on time) |
| 02_Q1, 04_Q3, 05_Q4 | DEMO-007_Qn_CPC_Minutes_Signed.pdf / _IAO_Committee_Minutes_Signed.pdf | Signed minutes | with that quarter's report |
| 03_Q2/r1_submitted_2027-01-13 | DEMO-007_Q2_Implementation_Progress_Report_AppendixV.pdf | Progress report, revision 1 | 13 Jan 2027 11:00 (on time) |
| 03_Q2/r1_submitted_2027-01-13 | DEMO-007_Q2_CPC_Minutes_Signed.pdf **(wrong period)** | Signed CPC minutes | 13 Jan 2027 11:00 |
| 03_Q2/r1_submitted_2027-01-13 | DEMO-007_Q2_IAO_Committee_Minutes_Signed.pdf | Signed IAO minutes | 13 Jan 2027 11:00; carried forward to revision 2 |
| 03_Q2/r2_submitted_2027-01-22 | DEMO-007_Q2_Implementation_Progress_Report_AppendixV_rev2.pdf | Progress report, revision 2 | 22 Jan 2027 14:30 |
| 03_Q2/r2_submitted_2027-01-22 | DEMO-007_Q2_CPC_Minutes_Signed.pdf (correct) | Signed CPC minutes, new evidence version | 22 Jan 2027 14:30 |

Both Q2 CPC files have the **same file name** but different content and SHA-256 hashes. The system should treat the second as a new evidence version, not an overwrite. The IAO minutes are not re-uploaded in revision 2; the same evidence version is referenced again.

The foundation documents are unchanged and all 12 foundation checks are accepted, giving 40 points. `DEMO-007_seed_fixture.json` holds the baseline, both Q2 revisions, the suitability checklists, the draft and final decisions with their dependencies, the clarification record and the SHA-256 hash of each file.

## Plan baseline (F3 §3.0)

| Milestone | Activity | Completion condition (each quarter) |
|---|---|---|
| M-01 Award criteria and results published | A-01 Publish award criteria and results | Criteria were published before awards, and results after, for the quarter. |
| M-02 Staff trained on the corruption prevention procedure | A-02 Train staff in affected functions | Training delivered to the staff named in the plan by quarter end. |
| M-03 Quarterly CPC meeting held | A-03 | CPC met in the quarter, chaired by the AO with the trained IAO Chair as Secretary; minutes signed. |
| M-04 Quarterly IAO Committee meeting held | A-04 | IAO Committee met in the quarter before the CPC meeting; minutes signed. |

## Quarterly baseline: claims versus review

| Quarter | M-01 (criteria < award < results) | M-02 Training | M-03 CPC | M-04 IAO | Provisional I | Reviewed I |
|---|---|---|---|---|---|---|
| Q1 | ✓ 15 Jul < 2 Sep < 9 Sep | ✓ Cohort A, 3 Sep | ✓ 22 Sep | ✓ 14 Sep | 1.00 | 1.00 |
| Q2 rev 1 | Claimed ✓; **clarification** | ✓ (IAO minutes) | Claimed ✓; **clarification** | ✓ 8 Dec | 1.00 | not final |
| Q2 rev 2 | ✓ 2 Oct < 4 Dec < 11 Dec | ✓ carried forward | ✓ 16 Dec | ✓ carried forward | 1.00 | **1.00** |
| Q3 | ✓ 11 Jan < 26 Feb < 5 Mar | ✓ Cohort C, 17 Feb | ✓ 18 Mar | ✓ 10 Mar | 1.00 | 1.00 |
| Q4 | ✓ 6 Apr < 21 May < 28 May | ✓ Cohort D, 19 May | ✓ 17 Jun | ✓ 8 Jun | 1.00 | 1.00 |

## The Q2 wrong-period evidence (demo walkthrough)

1. **Revision 1 (13 Jan 2027, on time).** The report claims 4 of 4 and cites `DEBF/CPC/MIN/Q2/2026-27`. The attached CPC file is a genuine DEBF document, but it is the signed minutes of the **15 December 2025** meeting (`DEBF/CPC/MIN/Q2/2025-26`, FY 2025/2026), picked up because it had the same file name. Provisional I2 = 1.00: every claim has a file of the right category, and provisional scoring does not judge period.
2. **Suitability checklist (AT30).** On the CPC file, Officer B records institution match **Pass**, period match **Deficient**, relevance **Deficient**, signature **Pass**, readability **Pass**. The reason is recorded as an evidence deficiency, not an allegation of fraud. The file stays on record as uploaded.
3. **Criterion decisions.** M-02 is accepted on MIN. IAO/04 (Cohort B, 7 of 7, 24 Nov 2026). M-04 is accepted on the IAO minutes. M-01 cannot be substantiated: the IAO minutes of 8 Dec show criteria before the award decision, but results publication was still pending. M-03 has no Q2 FY 2026/27 CPC minutes.
4. **Clarification CLR-DEMO-007-Q2-01** on M-01 and M-03 is issued and notified at 10:15 on 19 Jan 2027. It is due by 23:59:59 on 26 Jan 2027.
5. **Revision 2 (22 Jan 2027, timely).** The report is unchanged in every claim. It attaches the correct minutes of 16 Dec 2026 (signed 18 Dec 2026) under the same file name and carries the IAO minutes forward. Revision 1, its receipt and its files remain intact (AT09). First-submission time stays 13 Jan, which is on time. First-complete-evidence time is 22 Jan and is shown as a separate field, with no penalty.
6. **Dependency effects (AT27).** The decisions on M-01 and M-03 relied on the replaced CPC slot, so both are marked **Needs re-review**. M-02 and M-04 relied only on the unchanged IAO file, so they can carry forward only after Officer B explicitly confirms them against revision 2.
7. **Optional AT10 check.** Trying to finalize against revision 1 now returns a version conflict.
8. **Finalization (27 Jan 2027).** M-01 is accepted on MIN. CPC/05/Q2 (2 Oct < 4 Dec < 11 Dec 2026). This is a document received after the deadline that proves on-time completion. M-03 is accepted on the CPC signature page. Reviewed I2 = 1.00.
9. **Trace:** R-01 → A-01 → M-01 → Q2 revision 1 → wrong-period evidence version → suitability deficiency → clarification → revision 2 → new evidence version and passage MIN. CPC/05 → accepted decision → I2 = 1.00 → annual publication of 100.00.

## Notes

The correction stays within the minutes-only evidence rule (PRD §9.2). The replacement file is the CPC minutes the report already cited, so no extra evidence category needs organizer agreement, unlike DEMO-001's alternative branch.

The Q3 CPC minutes (MIN. CPC/03/Q3) and the Q3 report record the error and the corrective step, which is a file naming rule with financial year and meeting date plus a pre-submission attachment check. This is the institution's own follow-up and plays no part in scoring.
