import type {
  ConsolidatedReport,
  PublishedResult,
  QuarterDisposition,
  ReportIdentity,
} from '../draft/index.js';
import { points } from './scoring.js';
import type { PdfBlock, PdfDocument, PdfImage } from './report-pdf.js';

/*
 * The annual report as a document (HP2-64): built from the published result itself and the
 * identity kept with it, so the same version always gives the same document. Shared by the API
 * and the mock.
 */

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const DAYS = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ');

/** "Sun 1 Aug 2027, 08:00 EAT", as the app shows business time. */
export function formatEat(instant: string) {
  const at = new Date(Date.parse(instant) + 3 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${DAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}, ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())} EAT`;
}

/** "FY 2026/27" → "FY2026-27", for references and file names. */
const cycleCode = (cycleLabel: string) =>
  cycleLabel.replace(/\s+/g, '').replace(/\//g, '-');

export const SIMULATION_MARKING =
  'Simulation: not official EACC scoring. Fictional institutions and data.';

const dispositionLabel: Record<QuarterDisposition['status'], string> = {
  finalized: 'Finalized',
  closed_without_submission: 'Closed without submission (0)',
  awaiting_review: 'Awaiting officer review',
  awaiting_institution: 'Awaiting institution response',
  not_submitted: 'Not submitted',
};

function foundationResult(
  score: PublishedResult['evaluation']['foundations'][number]['score'],
) {
  if (score.maxPoints === 0)
    return score.status === 'calculated'
      ? score.fraction.numerator === score.fraction.denominator
        ? 'Prerequisite met (no points)'
        : `Prerequisite not met: ${score.fraction.numerator} of ${score.fraction.denominator} checks`
      : 'Prerequisite: pending review';
  return score.status === 'calculated'
    ? `${score.points} / ${score.maxPoints}`
    : `Pending (max ${score.maxPoints})`;
}

function timeliness(quarter: QuarterDisposition) {
  if (!quarter.firstSubmittedAt) return '—';
  const when = `first submitted ${formatEat(quarter.firstSubmittedAt)}`;
  if (!quarter.late) return `On time; ${when}`;
  const unit = quarter.daysLateUnit === 'working' ? 'working day' : 'day';
  const days = quarter.daysLate ?? 0;
  return `Late by ${days} ${unit}${days === 1 ? '' : 's'}; ${when}`;
}

function feedback(quarter: QuarterDisposition) {
  const parts = [quarter.reviewedBy ?? 'No reviewer recorded'];
  for (const item of quarter.rejected)
    parts.push(`${item.code} not accepted: ${item.reason}`);
  if (quarter.note) parts.push(quarter.note);
  // Reasons usually end in a full stop already; one separator, never two.
  return parts.map((part) => part.trim().replace(/\.+$/, '')).join('. ') + '.';
}

/** The method and limitations, as on screen. */
function method(
  result: Pick<PublishedResult, 'profileName' | 'simulation'>,
  weights: PublishedResult['evaluation']['weights'],
) {
  const quarterMax = weights.implementation / 4;
  return [
    `Annual result out of 100 = procedures (${weights.procedures}) + risk assessment (${weights.riskAssessment}) + mitigation plan (${weights.mitigationPlan}) + implementation (${weights.implementation} × the average of four quarters, each worth ${Number.isInteger(quarterMax) ? quarterMax : quarterMax.toFixed(2)} points). Foundations count once, from the version effective at the evaluation cutoff; quarters are never re-weighted over the ones reported.`,
    `${result.profileName}${result.simulation ? ': a simulation profile, not official EACC scoring' : ''}. Late reporting is shown separately; no late penalty is applied in this demonstration. Scores measure performance against each institution’s own accepted plan, not equal prevention impact.`,
  ];
}

/** The identity's images, read from storage by the caller. */
export interface ReportImages {
  logo?: PdfImage;
  signature?: PdfImage;
}

function cover(
  identity: ReportIdentity,
  images: ReportImages,
  cycleLabel: string,
  subject: string,
  details: [string, string][],
): PdfBlock[] {
  return [
    ...(images.logo
      ? [
          {
            kind: 'image' as const,
            image: images.logo,
            alt: `${identity.organizationName} logo`,
            height: 40,
          },
        ]
      : []),
    {
      kind: 'paragraph',
      text: identity.organizationName,
      bold: true,
      size: 11,
    },
    {
      kind: 'heading',
      level: 1,
      text: `${identity.reportTitle} · ${cycleLabel}`,
    },
    { kind: 'heading', level: 2, text: subject },
    {
      kind: 'table',
      header: ['Report detail', 'Value'],
      rows: details.map(([label, value]) => [label, value]),
      widths: [1, 3],
    },
    ...(identity.foreword
      ? [{ kind: 'paragraph' as const, text: identity.foreword, muted: true }]
      : []),
  ];
}

function signoff(identity: ReportIdentity, images: ReportImages): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  if (identity.signatory && images.signature)
    blocks.push({
      kind: 'image',
      image: images.signature,
      alt: `Signature of ${identity.signatory.name}`,
      height: 36,
    });
  if (identity.signatory)
    blocks.push(
      { kind: 'paragraph', text: identity.signatory.name, bold: true },
      {
        kind: 'paragraph',
        text: `${identity.signatory.title}, ${identity.organizationName}`,
        muted: true,
      },
    );
  if (identity.contact)
    blocks.push({ kind: 'paragraph', text: `Contact: ${identity.contact}` });
  if (identity.footer)
    blocks.push({
      kind: 'paragraph',
      text: identity.footer,
      muted: true,
      size: 9,
    });
  return blocks;
}

/** Foundations, quarters and the result for one institution, without the cover. */
function resultBlocks(
  result: PublishedResult,
  headingLevel: 2 | 3,
): PdfBlock[] {
  const { evaluation } = result;
  const quarterMax = evaluation.weights.implementation / 4;
  const total = evaluation.total;
  return [
    { kind: 'heading', level: headingLevel, text: 'Annual result' },
    {
      kind: 'paragraph',
      size: 14,
      bold: true,
      text:
        total.status === 'calculated'
          ? `${total.points} / 100`
          : `Pending: ${total.reasons.join('; ')}`,
    },
    ...(total.status === 'calculated'
      ? [
          {
            kind: 'paragraph' as const,
            text: `Foundations ${total.foundationPoints} + implementation ${total.implementationPoints} (${evaluation.weights.implementation} × average of four quarters, ${total.implementationAverage.numerator}/${total.implementationAverage.denominator}).`,
          },
        ]
      : []),
    { kind: 'heading', level: headingLevel, text: 'Foundations' },
    {
      kind: 'table',
      header: ['Foundation', 'Result', 'Checks not met'],
      rows: evaluation.foundations.map((foundation) => [
        foundation.label,
        foundationResult(foundation.score),
        foundation.failedChecks.length
          ? foundation.failedChecks
              .map((check) => `${check.check}: ${check.reason}`)
              .join('; ')
          : 'None',
      ]),
      widths: [1.3, 1.2, 3],
    },
    {
      kind: 'paragraph',
      muted: true,
      size: 9,
      text: 'Foundations are counted once, from the version effective at the evaluation cutoff.',
    },
    { kind: 'heading', level: headingLevel, text: 'Quarters' },
    {
      kind: 'table',
      header: [
        'Quarter',
        'Disposition',
        'Accepted',
        'Points',
        'Timeliness',
        'Reviewer and feedback',
      ],
      rows: evaluation.quarters.map((quarter) => [
        quarter.periodLabel,
        dispositionLabel[quarter.status],
        quarter.implementation
          ? `${quarter.implementation.numerator} of ${quarter.implementation.denominator}`
          : '—',
        quarter.implementation
          ? points(quarterMax, quarter.implementation)
          : 'Pending',
        timeliness(quarter),
        feedback(quarter),
      ]),
      widths: [0.8, 1.2, 0.8, 0.7, 1.8, 2.8],
    },
    {
      kind: 'paragraph',
      muted: true,
      size: 9,
      text: `Each quarter contributes up to ${Number.isInteger(quarterMax) ? quarterMax : quarterMax.toFixed(2)} implementation points. A missing quarter is never averaged away.`,
    },
  ];
}

export interface GeneratedDocument {
  document: PdfDocument;
  fileName: string;
  reference: string;
}

/** One institution's published annual report, as released (current or superseded). */
export function institutionReportDocument(
  result: PublishedResult,
  context: {
    cycleLabel: string;
    generatedAt: string;
    images: ReportImages;
    /** For a superseded version: the version that replaced it. */
    supersededBy: {
      version: number;
      publishedAt: string;
      reason: string | null;
    } | null;
  },
): GeneratedDocument {
  const code = cycleCode(context.cycleLabel);
  const reference = `CPI-${code}-${result.institutionId}-v${result.version}`;
  const identity = result.identity;
  const superseded = context.supersededBy
    ? `Superseded by version ${context.supersededBy.version} on ${formatEat(context.supersededBy.publishedAt)}${context.supersededBy.reason ? `: ${context.supersededBy.reason}` : ''}`
    : null;
  const subject = `${result.institutionId} · ${result.institutionName}`;
  const blocks: PdfBlock[] = [
    ...cover(identity, context.images, context.cycleLabel, subject, [
      ['Institution', subject],
      ['Cycle', context.cycleLabel],
      [
        'Scoring profile',
        `${result.profileName}${result.simulation ? ' (simulation profile)' : ''}`,
      ],
      [
        'Publication',
        `Version ${result.version}, batch ${result.batchId}, published ${formatEat(result.publishedAt)} by ${result.publishedBy}`,
      ],
      ...(result.correctionReason
        ? [['Correction', result.correctionReason] as [string, string]]
        : []),
      ...(superseded
        ? [['Status', superseded] as [string, string]]
        : [['Status', 'Current version'] as [string, string]]),
      ['Document reference', reference],
      ['Generated', formatEat(context.generatedAt)],
    ]),
    ...resultBlocks(result, 2),
    { kind: 'heading', level: 2, text: 'Method and limitations' },
    ...method(result, result.evaluation.weights).map((text) => ({
      kind: 'paragraph' as const,
      text,
    })),
    ...signoff(identity, context.images),
  ];
  return {
    reference,
    fileName: `${reference}.pdf`,
    document: {
      title: `${identity.reportTitle} · ${context.cycleLabel} · ${subject}`,
      lang: 'en-GB',
      author: identity.organizationName,
      subject: `Annual corruption prevention result, version ${result.version}`,
      header: `${identity.reportTitle} · ${context.cycleLabel} · ${result.institutionId} · version ${result.version}`,
      marking: context.supersededBy
        ? `Superseded by version ${context.supersededBy.version} on ${formatEat(context.supersededBy.publishedAt)}. Simulation: not official EACC scoring.`
        : SIMULATION_MARKING,
      footer: `${reference} · generated ${formatEat(context.generatedAt)}`,
      createdAt: result.publishedAt,
      accent: identity.accentColor,
      blocks,
    },
  };
}

/** The consolidated report: method, publication, coverage, summary, then each institution. */
export function consolidatedReportDocument(
  report: ConsolidatedReport,
  identity: ReportIdentity,
  context: { generatedAt: string; images: ReportImages },
): GeneratedDocument {
  const code = cycleCode(report.cycleLabel);
  const batch = report.batches.at(-1)?.batchId ?? 'unpublished';
  const reference = `CPI-${code}-consolidated-${batch}`;
  const labels = report.released[0]?.evaluation.quarters.map(
    (quarter) => quarter.periodLabel,
  ) ?? ['Q1', 'Q2', 'Q3', 'Q4'];
  const blocks: PdfBlock[] = [
    ...cover(
      identity,
      context.images,
      report.cycleLabel,
      'Consolidated report on all institutions',
      [
        ['Cycle', report.cycleLabel],
        [
          'Scoring profile',
          `${report.profileName}${report.simulation ? ' (simulation profile)' : ''}`,
        ],
        [
          'Released',
          `${report.released.length} of ${report.summary.length} institutions`,
        ],
        [
          'Publication',
          report.batches
            .map(
              (item) =>
                `${item.batchId}, ${formatEat(item.publishedAt)} by ${item.publishedBy} (${item.institutions})`,
            )
            .join('; ') || 'None yet',
        ],
        ['Document reference', reference],
        ['Generated', formatEat(context.generatedAt)],
      ],
    ),
    { kind: 'heading', level: 2, text: 'How results are calculated' },
    ...method(
      { profileName: report.profileName, simulation: report.simulation },
      report.weights,
    ).map((text) => ({ kind: 'paragraph' as const, text })),
    {
      kind: 'paragraph',
      text: 'Institutions are listed by ID and never ranked: plans differ in size and ambition, so equal values do not mean equal prevention impact.',
    },
    { kind: 'heading', level: 2, text: 'Corrections since first release' },
    ...(report.corrections.length
      ? [
          {
            kind: 'table' as const,
            header: ['Institution', 'Versions', 'Published', 'Reason'],
            rows: report.corrections.map((correction) => [
              `${correction.institutionId} ${correction.institutionName}`,
              `${correction.fromVersion} -> ${correction.toVersion}`,
              `${formatEat(correction.publishedAt)} by ${correction.publishedBy}`,
              correction.reason,
            ]),
            widths: [1.6, 0.8, 1.6, 2.4],
          },
        ]
      : [{ kind: 'paragraph' as const, text: 'None.' }]),
    { kind: 'heading', level: 2, text: 'Coverage' },
    {
      kind: 'table',
      header: ['Measure', 'Rate', 'Count', 'Definition'],
      rows: report.coverage.map((metric) => [
        metric.label,
        metric.percent === null ? 'Not applicable' : `${metric.percent}%`,
        `${metric.numerator} of ${metric.denominator}`,
        metric.definition,
      ]),
      widths: [1.4, 0.8, 0.8, 3],
    },
    { kind: 'heading', level: 2, text: 'Summary of all institutions' },
    {
      kind: 'table',
      header: [
        'Institution',
        'Result',
        'Foundations',
        ...labels,
        'Late',
        'Officer',
        'Version',
      ],
      rows: report.summary.map((row) =>
        row.released
          ? [
              `${row.institutionId} ${row.institutionName}`,
              row.points ?? 'Pending',
              row.foundationPoints ?? '—',
              ...row.quarters.map((quarter) => {
                const value =
                  quarter.status === 'closed_without_submission'
                    ? `${quarter.points ?? '0.00'} (closed)`
                    : (quarter.points ?? 'Pending');
                return quarter.late ? `${value} (late)` : value;
              }),
              String(row.lateQuarters),
              row.officerName ?? '—',
              String(row.version ?? '—'),
            ]
          : [
              `${row.institutionId} ${row.institutionName}`,
              `Not released: ${row.reasons.join('; ')}`,
              ...Array(labels.length + 4).fill(''),
            ],
      ),
      widths: [1.55, 0.8, 1.2, ...labels.map(() => 0.72), 0.55, 1.1, 0.95],
    },
    ...report.released.flatMap((result): PdfBlock[] => [
      { kind: 'pageBreak' },
      {
        kind: 'heading',
        level: 2,
        text: `${result.institutionId} ${result.institutionName} · version ${result.version}, published ${formatEat(result.publishedAt)}`,
      },
      ...resultBlocks(result, 3),
    ]),
    ...signoff(identity, context.images),
  ];
  return {
    reference,
    fileName: `${reference}.pdf`,
    document: {
      title: `${identity.reportTitle} · ${report.cycleLabel} · Consolidated report`,
      lang: 'en-GB',
      author: identity.organizationName,
      subject: 'Consolidated annual corruption prevention results',
      header: `${identity.reportTitle} · ${report.cycleLabel} · Consolidated`,
      marking: SIMULATION_MARKING,
      footer: `${reference} · generated ${formatEat(context.generatedAt)}`,
      createdAt: report.batches.at(-1)?.publishedAt ?? context.generatedAt,
      accent: identity.accentColor,
      blocks,
    },
  };
}
