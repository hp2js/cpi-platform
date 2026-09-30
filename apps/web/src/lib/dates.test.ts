import { expect, it } from 'vitest';
import {
  formatCalendarDate,
  formatDateTime,
  formatShortDateTime,
} from './dates';

it('shows deadlines in Nairobi time regardless of the device timezone', () => {
  expect(formatDateTime('2026-10-15T23:59:59+03:00')).toBe(
    'Thu 15 Oct 2026, 23:59 EAT',
  );
  expect(formatDateTime('2026-10-15T20:59:59Z')).toBe(
    'Thu 15 Oct 2026, 23:59 EAT',
  );
  expect(formatShortDateTime('2026-10-01T05:00:00Z')).toBe('1 Oct, 08:00');
});

it('uses unpadded days and stable month abbreviations', () => {
  expect(formatDateTime('2026-10-01T08:00:00+03:00')).toBe(
    'Thu 1 Oct 2026, 08:00 EAT',
  );
  expect(formatDateTime('2026-09-30T23:59:59+03:00')).toBe(
    'Wed 30 Sep 2026, 23:59 EAT',
  );
});

it('formats calendar dates without shifting the day', () => {
  expect(formatCalendarDate('2026-07-01')).toBe('1 Jul 2026');
});
