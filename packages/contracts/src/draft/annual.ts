import { z } from 'zod';
import { dayCountingModeSchema } from './cycle.js';
import { institutionIdSchema, instantSchema } from './common.js';
import { indicatorWeightsSchema } from './forms.js';
import { componentScoreSchema, fractionSchema } from './review.js';

/** Named business-time boundaries the demo clock can advance to (FR14). */
export const clockBoundarySchema = z.object({
  id: z.string(),
  label: z.string(),
  at: instantSchema,
  kind: z.enum([
    'reporting_open',
    'reminder',
    'deadline',
    'overdue',
    'cutoff',
    'publication',
  ]),
  passed: z.boolean(),
});
export type ClockBoundary = z.infer<typeof clockBoundarySchema>;

export const simulationStateSchema = z.object({
  runId: z.string(),
  businessTime: instantSchema,
  boundaries: z.array(clockBoundarySchema),
  /** Boundary events already processed in this run; replays are no-ops. */
  processedEvents: z.number().int().nonnegative(),
  /**
   * Whether advancing, a new run and the scripted year are available: only in the isolated demo
   * environment. Otherwise business time follows the real clock.
   */
  controls: z.boolean(),
  /**
   * Why the controls are off, so the administrator can fix the environment: demo mode is off
   * (`demo_only`), or the database is not the dedicated demo database (`not_demo_database`).
   */
  blockedBy: z.enum(['demo_only', 'not_demo_database']).nullable(),
});
export type SimulationState = z.infer<typeof simulationStateSchema>;

export const advanceRequestSchema = z.object({ boundaryId: z.string() });

export const scenarioStepSchema = z.object({
  at: instantSchema,
  actor: z.string(),
  summary: z.string(),
});
export const scenarioResultSchema = z.object({
  steps: z.array(scenarioStepSchema),
  businessTime: instantSchema,
});
export type ScenarioResult = z.infer<typeof scenarioResultSchema>;

/** Disposition of one quarter in the annual evaluation (PRD §7.6, §10.5). */
export const quarterDispositionSchema = z.object({
  periodId: z.string(),
  periodLabel: z.string(),
  status: z.enum([
    'finalized',
    'closed_without_submission',
    'awaiting_review',
    'awaiting_institution',
    'not_submitted',
  ]),
  implementation: fractionSchema.nullable(),
  late: z.boolean(),
  daysLate: z.number().int().nonnegative().nullable(),
  daysLateUnit: dayCountingModeSchema,
  firstSubmittedAt: instantSchema.nullable(),
  firstCompleteEvidenceAt: instantSchema.nullable(),
  revision: z.number().int().positive().nullable(),
  reviewedBy: z.string().nullable(),
  /** Rejected criteria with their reasons, for the explanation. */
  rejected: z.array(
    z.object({ code: z.string(), title: z.string(), reason: z.string() }),
  ),
  planSize: z.number().int().nonnegative(),
  /** Officer's recorded reason when a quarter was closed without submission. */
  note: z.string().nullable(),
  /*
   * Source records, so an exported result traces back to its decisions (FR16). Defaults keep
   * results published before these fields existed readable.
   */
  submissionId: z.string().nullable().default(null),
  formVersionId: z.string().nullable().default(null),
  /** The milestone decisions the finalized score counts. */
  decisionIds: z.array(z.string()).default([]),
  /** The reviewer's account ID; `reviewedBy` is their display name. */
  reviewerId: z.string().nullable().default(null),
  /** When the quarter was finalized or closed without submission. */
  reviewedAt: instantSchema.nullable().default(null),
});
export type QuarterDisposition = z.infer<typeof quarterDispositionSchema>;

export const foundationOutcomeSchema = z.object({
  kind: z.enum(['procedures', 'risk_assessment', 'mitigation_plan']),
  label: z.string(),
  score: componentScoreSchema,
  versionId: z.string().nullable(),
  failedChecks: z.array(z.object({ check: z.string(), reason: z.string() })),
  /** The foundation review the score counts, for traceability (FR16). */
  reviewId: z.string().nullable().default(null),
  reviewedBy: z.string().nullable().default(null),
  reviewerId: z.string().nullable().default(null),
  reviewedAt: instantSchema.nullable().default(null),
});

export const annualEvaluationSchema = z.object({
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  officerName: z.string(),
  quarters: z.array(quarterDispositionSchema).length(4),
  foundations: z.array(foundationOutcomeSchema).length(3),
  /** Weights of the profile the evaluation used; each quarter is worth implementation ÷ 4. */
  weights: indicatorWeightsSchema,
  /** The scoring profile the evaluation used, frozen with a published result. */
  scoringProfile: z
    .object({
      id: z.string(),
      name: z.string(),
      version: z.number().int().positive(),
      simulation: z.boolean(),
    })
    .nullable()
    .default(null),
  /** Annual score, or pending with reasons: never renormalised over reported quarters (§10.5). */
  total: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('calculated'),
      points: z.string(),
      implementationAverage: fractionSchema,
      foundationPoints: z.string(),
      implementationPoints: z.string(),
    }),
    z.object({ status: z.literal('pending'), reasons: z.array(z.string()) }),
  ]),
  releasable: z.boolean(),
  /**
   * An authorized institution-specific evaluation extension (PRD §7.3, AT29). It lets evidence
   * and review finish; it never extends the original cutoff for achievement or lateness.
   */
  extension: z
    .object({
      until: instantSchema,
      reason: z.string(),
      authorizedBy: z.string(),
      recordedBy: z.string(),
      recordedAt: instantSchema,
    })
    .nullable(),
  /** A clarification window ends after the cutoff and no extension covers it yet. */
  extensionRequired: z.boolean(),
  /** Reasons release must wait even when the total is calculable. */
  holds: z.array(z.string()),
  publication: z
    .object({
      id: z.string(),
      version: z.number().int().positive(),
      publishedAt: instantSchema,
      points: z.string(),
      stale: z.boolean(),
    })
    .nullable(),
  correction: z
    .object({
      id: z.string(),
      reason: z.string(),
      openedBy: z.string(),
      openedAt: instantSchema,
      periodId: z.string(),
    })
    .nullable(),
});
export type AnnualEvaluation = z.infer<typeof annualEvaluationSchema>;

export const extensionRequestSchema = z.object({
  institutionId: institutionIdSchema,
  untilDate: z.iso.date(),
  reason: z.string().trim().min(10).max(1000),
  authorizedBy: z.string().trim().min(3).max(200),
});
export type ExtensionRequest = z.infer<typeof extensionRequestSchema>;

export const annualOverviewSchema = z.object({
  cycleLabel: z.string(),
  profileName: z.string(),
  simulation: z.boolean(),
  evaluationCutoff: instantSchema,
  cutoffPassed: z.boolean(),
  asOf: instantSchema,
  institutions: z.array(annualEvaluationSchema),
});
export type AnnualOverview = z.infer<typeof annualOverviewSchema>;

export const publishRequestSchema = z.object({
  institutionIds: z.array(institutionIdSchema).min(1),
});
export type PublishRequest = z.infer<typeof publishRequestSchema>;
export const correctionRequestSchema = z.object({
  institutionId: institutionIdSchema,
  periodId: z.string(),
  reason: z.string().min(10).max(2000),
});
export type CorrectionRequest = z.infer<typeof correctionRequestSchema>;
export const closeNonresponseRequestSchema = z.object({
  reason: z.string().min(10).max(2000),
});

/** A released, immutable annual result (PRD §7.6, FR13). */
export const publishedResultSchema = z.object({
  id: z.string(),
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  version: z.number().int().positive(),
  batchId: z.string(),
  publishedAt: instantSchema,
  publishedBy: z.string(),
  status: z.enum(['current', 'superseded']),
  supersededBy: z.string().nullable(),
  correctionReason: z.string().nullable(),
  profileName: z.string(),
  simulation: z.boolean(),
  evaluation: annualEvaluationSchema.omit({
    publication: true,
    correction: true,
    releasable: true,
    extension: true,
    extensionRequired: true,
    holds: true,
  }),
});
export type PublishedResult = z.infer<typeof publishedResultSchema>;

export const institutionResultsSchema = z.object({
  released: z.boolean(),
  /** Explains why nothing is shown yet; no numerical result leaks before release (AT18). */
  message: z.string(),
  results: z.array(publishedResultSchema),
});
export type InstitutionResults = z.infer<typeof institutionResultsSchema>;

/** The on-screen consolidated report; the versioned export is `exportPayloadSchema`. */
export const consolidatedReportSchema = z.object({
  simulation: z.boolean(),
  generatedAt: instantSchema,
  cycleLabel: z.string(),
  profileName: z.string(),
  released: z.array(publishedResultSchema),
  unreleased: z.array(
    z.object({
      institutionId: institutionIdSchema,
      institutionName: z.string(),
      /** Calculable and free of holds: waiting only for publication. */
      ready: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
});
export type ConsolidatedReport = z.infer<typeof consolidatedReportSchema>;

/*
 * The annual export (PRD §12.3, FR13, FR16). CSV and JSON carry the same rows: CSV columns are
 * these keys in this order. A change that is not backwards compatible bumps the version.
 */
export const EXPORT_SCHEMA_VERSION = 'cpi-export-2';

export const exportRowSchema = z.object({
  schema_version: z.literal(EXPORT_SCHEMA_VERSION),
  /** Taken from the scoring profile the result used. */
  simulation: z.boolean(),
  cycle_id: z.string(),
  cycle_label: z.string(),
  scoring_profile_id: z.string().nullable(),
  scoring_profile_version: z.number().int().positive().nullable(),
  institution_id: institutionIdSchema,
  institution_name: z.string(),
  /** Unreleased institutions get one `annual_total` row with no points and the reasons. */
  release_status: z.enum(['released', 'unreleased']),
  indicator_id: z.enum([
    'annual_total',
    'procedures',
    'risk_assessment',
    'mitigation_plan',
    'implementation',
  ]),
  /** Set on implementation rows only. */
  period_id: z.string().nullable(),
  form_version: z.string().nullable(),
  submission_id: z.string().nullable(),
  submission_revision: z.number().int().positive().nullable(),
  /** Implementation: milestone decisions; foundations: the foundation review. */
  decision_ids: z.array(z.string()),
  reviewer_ref: z.string().nullable(),
  reviewed_at_utc: instantSchema.nullable(),
  /** Annual points, decimal strings with 2 places, rounded half up. */
  maximum_points: z.string().nullable(),
  earned_points: z.string().nullable(),
  status: z.string(),
  late: z.boolean().nullable(),
  days_late: z.number().int().nonnegative().nullable(),
  days_late_unit: dayCountingModeSchema.nullable(),
  missing_data_status: z.enum([
    'complete',
    'closed_without_submission',
    'pending',
  ]),
  rule_explanation: z.string(),
  publication_id: z.string().nullable(),
  publication_version: z.number().int().positive().nullable(),
  batch_id: z.string().nullable(),
  published_at_utc: instantSchema.nullable(),
});
export type ExportRow = z.infer<typeof exportRowSchema>;

export const exportFormats = {
  timestamps: 'ISO 8601 in UTC (suffix Z); columns ending _utc',
  points:
    'Annual points out of 100, decimal strings with 2 places, rounded half up',
  daysLate: 'Whole days, counted as days_late_unit states',
  lists: 'decision_ids is a JSON array; in CSV its values are joined with ;',
} as const;

export const exportPayloadSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  generatedAtUtc: instantSchema,
  formats: z.object({
    timestamps: z.literal(exportFormats.timestamps),
    points: z.literal(exportFormats.points),
    daysLate: z.literal(exportFormats.daysLate),
    lists: z.literal(exportFormats.lists),
  }),
  rows: z.array(exportRowSchema),
});
export type ExportPayload = z.infer<typeof exportPayloadSchema>;
