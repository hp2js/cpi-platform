import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

/*
 * The fictional DEMO-001…DEMO-008 evidence packs (docs/demo-evidence-packs), so the scripted
 * year submits readable signed minutes and cites the minute each milestone relies on.
 * ponytail: read from the repository checkout (host or development container); the production
 * image ships without docs, so it falls back to stand-in files. Copy the packs into the release
 * if the production image ever hosts the demo.
 */
const PACKS = join(__dirname, '../../../../docs/demo-evidence-packs/Test Docs');

const packDir = (institutionId: string) =>
  join(PACKS, `Demo-${institutionId.replace(/^DEMO-/, '')} Test Docs`);

/** The pack's signed CPC or IAO minutes for a quarter; `revision` picks `r2_…` folders. */
export function packMinutes(
  institutionId: string,
  quarter: number,
  committee: 'CPC' | 'IAO',
  revision = 1,
): { name: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const dir = join(packDir(institutionId), `0${quarter + 1}_Q${quarter}`);
  if (!existsSync(dir)) return null;
  const pattern = new RegExp(
    `_Q${quarter}_${committee === 'CPC' ? 'CPC' : 'IAO_Committee'}_Minutes`,
  );
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
    (path) => path.endsWith('.pdf') && pattern.test(basename(path)),
  );
  const file =
    files.find((path) => path.startsWith(`r${revision}_`)) ?? files[0];
  return file
    ? {
        name: basename(file),
        bytes: new Uint8Array(readFileSync(join(dir, file))),
      }
    : null;
}

/** The minute the pack says supports a milestone, for the cited file's committee. */
export function packPassage(
  institutionId: string,
  quarter: number,
  milestoneTitle: string,
  committee: 'CPC' | 'IAO',
): string | null {
  const fixture = join(
    packDir(institutionId),
    `${institutionId}_seed_fixture.json`,
  );
  if (!existsSync(fixture)) return null;
  const pack = JSON.parse(readFileSync(fixture, 'utf8')) as {
    quarters?: Record<
      string,
      { milestones?: { description: string; evidence_passage?: string }[] }
    >;
  };
  // Titles differ slightly ("IAO Committee meeting" in packs, ": quarter 2 …" suffixes here).
  const plain = (text: string) => text.replace(/ Committee\b/g, '');
  const title = plain(milestoneTitle);
  const milestone = pack.quarters?.[`Q${quarter}`]?.milestones?.find(
    ({ description }) =>
      title.startsWith(plain(description)) ||
      plain(description).startsWith(title),
  );
  const parts = (milestone?.evidence_passage ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const passage = parts.find((part) => part.includes(committee)) ?? parts[0];
  return passage ? passage.slice(0, 200) : null;
}
