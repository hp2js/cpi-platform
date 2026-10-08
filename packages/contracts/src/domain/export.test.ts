import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { exportPayloadSchema } from '../draft/annual.js';
import { parseCsv } from './csv.js';
import { exportColumns, exportCsv, exportPayload } from './export.js';

const payload = exportPayload({
  cycle: { id: 'FY2026-27', label: 'FY 2026/27' },
  profile: { id: 'mock-v1', version: 1, simulation: true },
  generatedAt: '2027-08-01T09:00:00+03:00',
  released: [],
  unreleased: [
    {
      institutionId: 'DEMO-002',
      institutionName: 'Example, Authority',
      ready: false,
      reasons: ['=HYPERLINK("x")', 'Q2 awaiting officer review'],
    },
  ],
});

it('states formats and converts timestamps to UTC', () => {
  expect(exportPayloadSchema.parse(payload)).toEqual(payload);
  expect(payload.generatedAtUtc).toBe('2027-08-01T06:00:00.000Z');
  expect(payload.formats.timestamps).toMatch(/UTC/);
});

it('lists an unreleased institution with its reasons and no numbers', () => {
  expect(payload.rows).toEqual([
    expect.objectContaining({
      release_status: 'unreleased',
      indicator_id: 'annual_total',
      maximum_points: null,
      earned_points: null,
      status: 'pending',
      missing_data_status: 'pending',
      simulation: true,
      scoring_profile_version: 1,
    }),
  ]);
});

it('writes the same rows as CSV, neutralising formulas', () => {
  const csv = exportCsv(payload);
  expect(csv).toContain(`'=HYPERLINK`);
  const [header, row] = parseCsv(csv);
  expect(header).toEqual(exportColumns);
  expect(row![exportColumns.indexOf('institution_name')]).toBe(
    'Example, Authority',
  );
  expect(row![exportColumns.indexOf('rule_explanation')]).toBe(
    '=HYPERLINK("x"). Q2 awaiting officer review.',
  );
});

it('documents exactly the exported columns, in order (docs/api-handover.md)', () => {
  const doc = readFileSync(
    new URL('../../../../docs/api-handover.md', import.meta.url),
    'utf8',
  );
  const section = doc.slice(doc.indexOf('## Export (`cpi-export-2`'));
  const documented = [...section.matchAll(/^\| `([a-z_]+)` +\|/gm)].map(
    (match) => match[1],
  );
  expect(documented).toEqual(exportColumns);
});
