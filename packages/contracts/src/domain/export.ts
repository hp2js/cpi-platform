import {
  EXPORT_SCHEMA_VERSION,
  exportFormats,
  exportRowSchema,
  type ConsolidatedReport,
  type ExportPayload,
  type ExportRow,
  type PublishedResult,
} from '../draft/annual.js';
import { toCsv } from './csv.js';
import { format2, mul, rational } from './rational.js';

/*
 * The annual export (PRD §12.3, FR13, FR16), built once here so the API and the mock produce
 * identical files. One `annual_total` row per institution, then one row per foundation and per
 * quarter, each traceable to the decisions behind it.
 */

export interface ExportInput {
  cycle: { id: string; label: string };
  /** The cycle's current profile: used for unreleased rows and older snapshots without one. */
  profile: { id: string; version: number; simulation: boolean };
  generatedAt: string;
  released: PublishedResult[];
  unreleased: ConsolidatedReport['unreleased'];
}

const utc = (instant: string | null) =>
  instant === null ? null : new Date(instant).toISOString();
/** Joins explanation parts as sentences, whatever punctuation each reason ends with. */
const sentences = (parts: string[]) =>
  parts.map((part) => (/[.!?]$/.test(part) ? part : `${part}.`)).join(' ');
const fixed2 = (value: number) =>
  format2(rational(Math.round(value * 100), 100));

function releasedRows(
  input: ExportInput,
  result: PublishedResult,
): ExportRow[] {
  const evaluation = result.evaluation;
  const profile = evaluation.scoringProfile ?? {
    ...input.profile,
    name: result.profileName,
  };
  const common = {
    schema_version: EXPORT_SCHEMA_VERSION,
    simulation: profile.simulation,
    cycle_id: input.cycle.id,
    cycle_label: input.cycle.label,
    scoring_profile_id: profile.id,
    scoring_profile_version: profile.version,
    institution_id: result.institutionId,
    institution_name: result.institutionName,
    release_status: 'released',
    publication_id: result.id,
    publication_version: result.version,
    batch_id: result.batchId,
    published_at_utc: utc(result.publishedAt),
  } as const;
  const none = {
    period_id: null,
    form_version: null,
    submission_id: null,
    submission_revision: null,
    late: null,
    days_late: null,
    days_late_unit: null,
  };
  const w = evaluation.weights;
  const total = evaluation.total;
  const quarterMax = w.implementation / 4;
  return [
    {
      ...common,
      ...none,
      indicator_id: 'annual_total',
      // The release itself is traced by publication_id and batch_id.
      decision_ids: [],
      reviewer_ref: null,
      reviewed_at_utc: null,
      maximum_points: fixed2(
        w.procedures + w.riskAssessment + w.mitigationPlan + w.implementation,
      ),
      earned_points: total.status === 'calculated' ? total.points : null,
      status: total.status,
      missing_data_status:
        total.status === 'calculated' ? 'complete' : 'pending',
      rule_explanation:
        total.status === 'calculated'
          ? `Foundations ${total.foundationPoints} + implementation ${total.implementationPoints} (${w.implementation} × average ${total.implementationAverage.numerator}/${total.implementationAverage.denominator} over four quarters) = ${total.points}`
          : sentences(total.reasons),
    },
    ...evaluation.foundations.map((foundation): ExportRow => ({
      ...common,
      ...none,
      indicator_id: foundation.kind,
      decision_ids: foundation.reviewId ? [foundation.reviewId] : [],
      reviewer_ref: foundation.reviewerId ?? foundation.reviewedBy,
      reviewed_at_utc: utc(foundation.reviewedAt),
      maximum_points: fixed2(foundation.score.maxPoints),
      earned_points:
        foundation.score.status === 'calculated'
          ? foundation.score.points
          : null,
      status: foundation.score.status,
      missing_data_status:
        foundation.score.status === 'calculated' ? 'complete' : 'pending',
      rule_explanation:
        foundation.score.status === 'calculated'
          ? sentences([
              `${foundation.label}: ${foundation.score.fraction.numerator}/4 checks passed × ${foundation.score.maxPoints} points`,
              ...foundation.failedChecks.map(
                (failed) => `failed “${failed.check}”: ${failed.reason}`,
              ),
            ])
          : `${foundation.label} not reviewed on its active version`,
    })),
    ...evaluation.quarters.map((quarter): ExportRow => ({
      ...common,
      indicator_id: 'implementation',
      period_id: quarter.periodId,
      form_version: quarter.formVersionId,
      submission_id: quarter.submissionId,
      submission_revision: quarter.revision,
      decision_ids: quarter.decisionIds,
      reviewer_ref: quarter.reviewerId ?? quarter.reviewedBy,
      reviewed_at_utc: utc(quarter.reviewedAt),
      maximum_points: fixed2(quarterMax),
      earned_points: quarter.implementation
        ? format2(
            mul(
              rational(w.implementation, 4),
              rational(
                quarter.implementation.numerator,
                quarter.implementation.denominator,
              ),
            ),
          )
        : null,
      status: quarter.status,
      late: quarter.late,
      days_late: quarter.daysLate,
      days_late_unit: quarter.daysLateUnit,
      missing_data_status:
        quarter.status === 'closed_without_submission'
          ? 'closed_without_submission'
          : quarter.implementation
            ? 'complete'
            : 'pending',
      rule_explanation:
        quarter.status === 'closed_without_submission'
          ? (quarter.note ?? 'Closed without submission (0)')
          : quarter.implementation
            ? sentences([
                `${quarter.periodLabel}: ${quarter.implementation.numerator}/${quarter.implementation.denominator} milestones accepted × ${w.implementation} ÷ 4`,
                ...quarter.rejected.map(
                  (rejected) => `${rejected.code} rejected: ${rejected.reason}`,
                ),
              ])
            : `${quarter.periodLabel} ${quarter.status.replaceAll('_', ' ')}`,
    })),
  ];
}

function unreleasedRow(
  input: ExportInput,
  institution: ConsolidatedReport['unreleased'][number],
): ExportRow {
  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    simulation: input.profile.simulation,
    cycle_id: input.cycle.id,
    cycle_label: input.cycle.label,
    scoring_profile_id: input.profile.id,
    scoring_profile_version: input.profile.version,
    institution_id: institution.institutionId,
    institution_name: institution.institutionName,
    release_status: 'unreleased',
    indicator_id: 'annual_total',
    period_id: null,
    form_version: null,
    submission_id: null,
    submission_revision: null,
    decision_ids: [],
    reviewer_ref: null,
    reviewed_at_utc: null,
    // No numbers before release (AT18): the reasons say what is outstanding.
    maximum_points: null,
    earned_points: null,
    status: institution.ready ? 'ready_not_published' : 'pending',
    late: null,
    days_late: null,
    days_late_unit: null,
    missing_data_status: institution.ready ? 'complete' : 'pending',
    rule_explanation: sentences(institution.reasons),
    publication_id: null,
    publication_version: null,
    batch_id: null,
    published_at_utc: null,
  };
}

export const exportColumns = Object.keys(
  exportRowSchema.shape,
) as (keyof ExportRow)[];

export function exportPayload(input: ExportInput): ExportPayload {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAtUtc: utc(input.generatedAt)!,
    formats: exportFormats,
    rows: [
      ...[...input.released]
        .sort((a, b) => a.institutionId.localeCompare(b.institutionId))
        .flatMap((result) => releasedRows(input, result)),
      ...[...input.unreleased]
        .sort((a, b) => a.institutionId.localeCompare(b.institutionId))
        .map((institution) => unreleasedRow(input, institution)),
    ].map(
      // Keys in column order, so the JSON reads like the CSV.
      (row) =>
        Object.fromEntries(
          exportColumns.map((column) => [column, row[column]]),
        ) as ExportRow,
    ),
  };
}

export function exportCsv(payload: ExportPayload) {
  return toCsv(
    exportColumns,
    payload.rows.map((row) =>
      exportColumns.map((column) => {
        const value = row[column];
        return Array.isArray(value) ? value.join(';') : value;
      }),
    ),
  );
}
