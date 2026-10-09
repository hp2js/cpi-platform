/*
 * Runs the configured provider over the synthetic evaluation set (HP2-61) and prints the
 * figures docs/assistant.md reports: precision and recall per kind, English and other languages
 * separately, against the Decision 5 bar; must-flag documents; discarded and injection-driven
 * output. Writes the raw run next to the set. Only numbers from runs actually made are reported.
 *
 *   pnpm --filter @cpi/api assistant:evaluate                  # deterministic
 *   ASSISTANT_PROVIDER=openai-compatible ASSISTANT_MODEL=qwen2.5:7b pnpm --filter @cpi/api assistant:evaluate
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ASSISTANT_PROMPT_REVISION,
  assess,
  assistantKinds,
  checkUpload,
  instructionLike,
  type AssistantContext,
  type AssistantKind,
} from '@cpi/contracts';
import { loadConfig } from '../config';
import { extractText } from './extract';
import { providerFrom } from './providers';

const SET = join(__dirname, '../../../../docs/assistant-evaluation');

/** Decision 5: precision and recall bars per kind. */
const BAR: Record<AssistantKind, { precision: number; recall: number }> = {
  institution: { precision: 0.9, recall: 0.7 },
  period: { precision: 0.9, recall: 0.7 },
  passage: { precision: 0.85, recall: 0.7 },
  citation: { precision: 0.85, recall: 0.7 },
  approval: { precision: 0.8, recall: 0.7 },
  missing: { precision: 0.8, recall: 0.6 },
};

interface Expected {
  kind: AssistantKind;
  finding: string;
  milestone?: string;
  quoteIncludes?: string[];
  optional?: boolean;
}
interface Case {
  file: string;
  language: 'en' | 'sw' | 'mixed';
  citations: Record<string, string>;
  expected: Expected[];
  mustFlag?: { kind: AssistantKind; finding: string };
  unreadablePages?: number[];
  injection?: boolean;
}

async function main() {
  const config = loadConfig({
    DATABASE_URL: 'postgres://unused/unused',
    REDIS_URL: 'redis://unused',
    ...process.env,
  });
  const provider = providerFrom(config);
  const set = JSON.parse(
    await readFile(join(SET, 'expected.json'), 'utf8'),
  ) as {
    context: Omit<AssistantContext, 'citations'>;
    milestones: Record<string, string>;
    documents: Case[];
  };
  const tally = {
    en: new Map<
      AssistantKind,
      { shown: number; correct: number; expected: number; found: number }
    >(),
    other: new Map<
      AssistantKind,
      { shown: number; correct: number; expected: number; found: number }
    >(),
  };
  for (const kind of assistantKinds)
    for (const map of Object.values(tally))
      map.set(kind, { shown: 0, correct: 0, expected: 0, found: 0 });
  const results = [];
  const problems: string[] = [];
  let untraceable = 0;
  let instructionPassages = 0;
  let injectionDriven = 0;
  let failures = 0;

  for (const item of set.documents) {
    const bytes = await readFile(join(SET, 'files', item.file));
    const check = await checkUpload(item.file, bytes);
    if (!check.ok) throw new Error(`${item.file}: ${check.message}`);
    const context: AssistantContext = {
      ...set.context,
      citations: Object.entries(item.citations).map(([code, passage]) => ({
        milestoneCode: code,
        milestoneTitle: set.milestones[code]!,
        passage,
      })),
    };
    const started = Date.now();
    const extraction = await extractText(
      bytes,
      check.mimeType,
      config.ASSISTANT_MAX_PAGES,
    );
    if (!extraction.ok) {
      failures += 1;
      problems.push(`${item.file}: not read (${extraction.reason})`);
      continue;
    }
    let proposal;
    try {
      proposal = await provider.propose(
        extraction.document,
        context,
        AbortSignal.timeout(config.ASSISTANT_TIMEOUT_MS),
      );
    } catch (error) {
      failures += 1;
      problems.push(
        `${item.file}: provider failed (${(error as Error).message})`,
      );
      continue;
    }
    const result = assess(extraction.document, context, proposal.candidates);
    result.discarded.untraceable += proposal.malformed;
    untraceable += result.discarded.untraceable;
    instructionPassages += result.discarded.instructionLike;
    const map = item.language === 'en' ? tally.en : tally.other;
    const open = [...item.expected];
    for (const suggestion of result.suggestions) {
      const counts = map.get(suggestion.kind)!;
      counts.shown += 1;
      const index = open.findIndex(
        (expected) =>
          expected.kind === suggestion.kind &&
          expected.finding === suggestion.finding &&
          (expected.milestone ?? null) === suggestion.milestoneCode &&
          (!expected.quoteIncludes ||
            expected.quoteIncludes.some((part) =>
              suggestion.quote?.toLowerCase().includes(part.toLowerCase()),
            )),
      );
      if (index >= 0) {
        counts.correct += 1;
        if (!open[index]!.optional) counts.found += 1;
        open.splice(index, 1);
      } else {
        problems.push(
          `${item.file}: unexpected ${suggestion.kind}/${suggestion.finding}${suggestion.milestoneCode ? ` ${suggestion.milestoneCode}` : ''}${suggestion.quote ? ` “${suggestion.quote.slice(0, 80)}”` : ''}`,
        );
        if (item.injection) injectionDriven += 1;
      }
      if (suggestion.quote && instructionLike(suggestion.quote))
        injectionDriven += 1;
    }
    for (const expected of item.expected)
      if (!expected.optional) map.get(expected.kind)!.expected += 1;
    for (const missed of open.filter((expected) => !expected.optional))
      problems.push(
        `${item.file}: missed ${missed.kind}/${missed.finding}${missed.milestone ? ` ${missed.milestone}` : ''}`,
      );
    const flagged =
      !item.mustFlag ||
      result.suggestions.some(
        (s) =>
          s.kind === item.mustFlag!.kind &&
          s.finding === item.mustFlag!.finding,
      );
    if (!flagged) problems.push(`${item.file}: MUST-FLAG MISSED`);
    const unreadableOk =
      JSON.stringify(result.unreadablePages) ===
      JSON.stringify(item.unreadablePages ?? []);
    if (!unreadableOk)
      problems.push(
        `${item.file}: unreadable pages ${JSON.stringify(result.unreadablePages)}`,
      );
    if (result.language !== item.language)
      problems.push(`${item.file}: language detected as ${result.language}`);
    results.push({
      file: item.file,
      ms: Date.now() - started,
      model: proposal.model,
      language: result.language,
      unreadablePages: result.unreadablePages,
      discarded: result.discarded,
      mustFlag: item.mustFlag ? flagged : null,
      suggestions: result.suggestions,
    });
  }

  const date = new Date().toISOString().slice(0, 10);
  const model = results[0]?.model ?? provider.model;
  const pct = (part: number, whole: number) =>
    whole ? `${((100 * part) / whole).toFixed(0)}%` : 'n/a';
  const table = (map: (typeof tally)['en']) =>
    [
      '| Kind | Shown | Correct | Precision | Expected | Found | Recall | Meets bar |',
      '|---|---|---|---|---|---|---|---|',
      ...assistantKinds.map((kind) => {
        const t = map.get(kind)!;
        const precision = t.shown ? t.correct / t.shown : null;
        const recall = t.expected ? t.found / t.expected : null;
        const meets =
          precision === null && recall === null
            ? 'not measured'
            : (precision ?? 1) >= BAR[kind].precision &&
                (recall ?? 1) >= BAR[kind].recall
              ? 'yes'
              : 'no';
        return `| ${kind} | ${t.shown} | ${t.correct} | ${pct(t.correct, t.shown)} | ${t.expected} | ${t.found} | ${pct(t.found, t.expected)} | ${meets} |`;
      }),
    ].join('\n');
  const mustFlags = results.filter((r) => r.mustFlag !== null);
  const report = [
    `## ${provider.name} · ${model} · ${date}`,
    '',
    `Prompt revision ${ASSISTANT_PROMPT_REVISION}. ${set.documents.length} documents, ${failures} not processed. Median time per document ${median(results.map((r) => r.ms))} ms.`,
    '',
    `- Untraceable output discarded (never shown): ${untraceable}`,
    `- Instruction-like passages found and ignored: ${instructionPassages}`,
    `- Injection-driven suggestions shown: ${injectionDriven}`,
    `- Must-flag documents flagged: ${mustFlags.filter((r) => r.mustFlag).length} of ${mustFlags.length}`,
    '',
    '### English',
    '',
    table(tally.en),
    '',
    '### Kiswahili and mixed',
    '',
    table(tally.other),
    '',
    '### Misses and unexpected suggestions',
    '',
    ...(problems.length ? problems.map((p) => `- ${p}`) : ['- none']),
  ].join('\n');
  console.log(report);
  const out = join(SET, 'results');
  await mkdir(out, { recursive: true });
  await writeFile(
    join(
      out,
      `${date}-${provider.name}-${model.replace(/[^\w.-]+/g, '_')}.json`,
    ),
    `${JSON.stringify({ provider: provider.name, model, promptRevision: ASSISTANT_PROMPT_REVISION, date, report, results }, null, 2)}\n`,
  );
}

const median = (values: number[]) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    : 0;

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
