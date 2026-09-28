import type { Cycle } from '../index.js';

/** FY2026/27 demo calendar from PRD §9.1 (Africa/Nairobi, UTC+03:00, no DST). */
export const cycle: Cycle = {
  id: 'FY2026-27',
  label: 'FY 2026/27',
  timezone: 'Africa/Nairobi',
  foundationDeadline: '2026-09-30T23:59:59+03:00',
  evaluationCutoff: '2027-07-31T23:59:59+03:00',
  periods: [
    {
      id: 'FY2026-27-Q1',
      quarter: 1,
      label: 'Q1',
      startsOn: '2026-07-01',
      endsOn: '2026-09-30',
      submissionDeadline: '2026-10-15T23:59:59+03:00',
    },
    {
      id: 'FY2026-27-Q2',
      quarter: 2,
      label: 'Q2',
      startsOn: '2026-10-01',
      endsOn: '2026-12-31',
      submissionDeadline: '2027-01-15T23:59:59+03:00',
    },
    {
      id: 'FY2026-27-Q3',
      quarter: 3,
      label: 'Q3',
      startsOn: '2027-01-01',
      endsOn: '2027-03-31',
      submissionDeadline: '2027-04-15T23:59:59+03:00',
    },
    {
      id: 'FY2026-27-Q4',
      quarter: 4,
      label: 'Q4',
      startsOn: '2027-04-01',
      endsOn: '2027-06-30',
      submissionDeadline: '2027-07-15T23:59:59+03:00',
    },
  ],
};

/** The demo opens on the first day of Q1 reporting. */
export const initialBusinessTime = '2026-10-01T08:00:00+03:00';
