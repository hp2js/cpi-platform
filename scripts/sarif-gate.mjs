#!/usr/bin/env node
// The secure-PR gate's single merge policy, applied to every scanner's SARIF:
//   blocks: any secret (Gitleaks), any result at level "error", or a security-severity ≥ 7.0
//   (high/critical); everything else is reported, not blocking.
// Accepted risks live in security/exceptions.json with a reason, an owner and an expiry date;
// an expired exception blocks again, so every acceptance is revisited.
// Usage: node scripts/sarif-gate.mjs <file.sarif>... [--summary <out.md>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const summaryAt = args.indexOf('--summary');
const summaryPath = summaryAt >= 0 ? args.splice(summaryAt, 2)[1] : undefined;
const exceptionsPath = new URL('../security/exceptions.json', import.meta.url);
const exceptions = existsSync(exceptionsPath)
  ? JSON.parse(readFileSync(exceptionsPath, 'utf8'))
  : [];
const today = new Date().toISOString().slice(0, 10);
const alwaysBlock = new Set(['gitleaks']);

const rows = [];
for (const file of args) {
  const sarif = JSON.parse(readFileSync(file, 'utf8'));
  for (const run of sarif.runs ?? []) {
    const tool = run.tool.driver.name.toLowerCase();
    const rules = new Map(
      [run.tool.driver, ...(run.tool.extensions ?? [])]
        .flatMap((component) => component.rules ?? [])
        .map((rule) => [rule.id, rule]),
    );
    for (const result of run.results ?? []) {
      if (result.suppressions?.some((s) => s.status !== 'rejected')) continue;
      const rule = rules.get(result.ruleId) ?? {};
      const level =
        result.level ?? rule.defaultConfiguration?.level ?? 'warning';
      const severity = Number(
        result.properties?.['security-severity'] ??
          rule.properties?.['security-severity'] ??
          0,
      );
      const location = result.locations?.[0]?.physicalLocation;
      const path = location?.artifactLocation?.uri ?? '';
      const line = location?.region?.startLine;
      const blocking =
        alwaysBlock.has(tool) || level === 'error' || severity >= 7;
      const exception = exceptions.find(
        (e) =>
          e.tool.toLowerCase() === tool &&
          e.ruleId === result.ruleId &&
          (!e.path || path.startsWith(e.path)),
      );
      const status = !blocking
        ? 'report'
        : !exception
          ? 'BLOCK'
          : exception.expires < today
            ? 'BLOCK (exception expired)'
            : 'accepted';
      rows.push({
        tool,
        ruleId: result.ruleId,
        level,
        severity,
        path,
        line,
        status,
      });
    }
  }
}

const blocked = rows.filter((row) => row.status.startsWith('BLOCK'));
const counts = Object.entries(
  Object.groupBy(rows, (row) => `${row.tool} · ${row.status}`),
).map(([key, list]) => `| ${key.replace(' · ', ' | ')} | ${list.length} |`);
const lines = [
  `## Secure-PR gate: ${blocked.length ? `❌ ${blocked.length} blocking` : '✅ pass'}`,
  '',
  `${rows.length} findings from ${args.length} SARIF files.`,
  '',
  '| Tool | Status | Findings |',
  '| --- | --- | --- |',
  ...counts.sort(),
  '',
  ...(blocked.length
    ? [
        '### Blocking',
        '',
        '| Tool | Rule | Severity | Location |',
        '| --- | --- | --- | --- |',
        ...blocked.map(
          (row) =>
            `| ${row.tool} | ${row.ruleId} | ${row.severity || row.level} | ${row.path}${row.line ? `:${row.line}` : ''} |`,
        ),
      ]
    : []),
];
const report = lines.join('\n');
console.log(report);
if (summaryPath) writeFileSync(summaryPath, `${report}\n`, { flag: 'a' });
process.exitCode = blocked.length ? 1 : 0;
