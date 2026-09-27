import { z } from 'zod';
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
});
export type QuarterDisposition = z.infer<typeof quarterDispositionSchema>;

export const foundationOutcomeSchema = z.object({
  kind: z.enum(['procedures', 'risk_assessment', 'mitigation_plan']),
  label: z.string(),
  score: componentScoreSchema,
  versionId: z.string().nullable(),
  failedChecks: z.array(z.object({ check: z.string(), reason: z.string() })),
});

export const annualEvaluationSchema = z.object({
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  officerName: z.string(),
  quarters: z.array(quarterDispositionSchema).length(4),
  foundations: z.array(foundationOutcomeSchema).length(3),
  /** Weights of the profile the evaluation used; each quarter is worth implementation ÷ 4. */
  weights: indicatorWeightsSchema,
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
export const correctionRequestSchema = z.object({
  institutionId: institutionIdSchema,
  periodId: z.string(),
  reason: z.string().min(10).max(2000),
});
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

export const consolidatedReportSchema = z.object({
  schemaVersion: z.literal('cpi-export-1'),
  simulation: z.boolean(),
  generatedAt: instantSchema,
  cycleLabel: z.string(),
  profileName: z.string(),
  released: z.array(publishedResultSchema),
  unreleased: z.array(
    z.object({
      institutionId: institutionIdSchema,
      institutionName: z.string(),
      reasons: z.array(z.string()),
    }),
  ),
});
export type ConsolidatedReport = z.infer<typeof consolidatedReportSchema>;
