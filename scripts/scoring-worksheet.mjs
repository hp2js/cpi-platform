import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

// HP2-11: writes docs/acceptance/scoring-worksheet.md from the built fixtures, or with
// --check fails when the committed worksheet is stale. It also enforces that the independent
// worksheet and the catalogue import nothing but each other (no engine, API, mock or seed).
const source = new URL(
  '../packages/contracts/src/scoring-fixtures/',
  import.meta.url,
);
for (const file of ['worksheet.ts', 'catalogue.ts']) {
  const imports = [
    ...readFileSync(new URL(file, source), 'utf8').matchAll(
      /from\s+'([^']+)'/g,
    ),
  ].map((match) => match[1]);
  for (const specifier of imports)
    assert.ok(
      ['./worksheet.js', './catalogue.js'].includes(specifier),
      `${file} must stay independent of the implementation; it imports ${specifier}`,
    );
}

const { renderWorksheet } =
  await import('../packages/contracts/dist/scoring-fixtures/report.js');
const target = new URL(
  '../docs/acceptance/scoring-worksheet.md',
  import.meta.url,
);
const rendered = renderWorksheet();
if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(target, 'utf8');
  } catch {
    // Missing: reported as stale below.
  }
  assert.ok(
    committed === rendered,
    'docs/acceptance/scoring-worksheet.md is stale: run `pnpm worksheet`',
  );
  console.log('Scoring worksheet is up to date');
} else {
  writeFileSync(target, rendered);
  console.log(`Wrote ${target.pathname}`);
}
