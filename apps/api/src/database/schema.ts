import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import type {
  BaselineCheck,
  FormChange,
  ReportIdentity,
  RiskScale,
  AccountingOfficer,
  Attestation,
  AuditEvent,
  ClarificationItem,
  OversightComment,
  DayCounting,
  DayCountingMode,
  FoundationKind,
  FormSection,
  IndicatorWeights,
  Milestone,
  ProfileChecklists,
  Receipt,
  ReportAnswers,
  Role,
  SuitabilityChecks,
} from '@cpi/contracts';

/**
 * Instants are stored as timestamptz and exchanged as the contracts' ISO-8601 strings in
 * Africa/Nairobi time (UTC+3, no daylight saving), e.g. `2026-10-15T23:59:59+03:00`.
 */
export const toNairobi = (value: Date | string) =>
  `${new Date(new Date(value).getTime() + 3 * 3_600_000).toISOString().slice(0, 19)}+03:00`;

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

const instant = customType<{ data: string; driverData: Date | string }>({
  dataType: () => 'timestamp with time zone',
  toDriver: (value) => value,
  fromDriver: toNairobi,
});

/*
 * One table per collection of the mock store (apps/web/src/mocks/db.ts), which the API
 * contracts were designed against. Keys, scope, state and versions are columns; nested value
 * objects that are always read whole (answers, snapshots, checklists) are jsonb. History is
 * kept as new rows plus supersede markers; nothing is deleted.
 */

/** Readable record IDs (`sub-0042`), like the mock's monotonic counter. */
export const recordIds = pgSequence('record_ids');

/* Directory (FR01, PRD §5.2) */

/** Managed list (Settings → Institution types); retiring keeps history, renaming relabels. */
export const institutionTypes = pgTable('institution_types', {
  id: text().primaryKey(),
  position: serial(),
  label: text().notNull(),
  active: boolean().notNull().default(true),
});

export const institutions = pgTable('institutions', {
  id: text().primaryKey(),
  name: text().notNull(),
  type: text().notNull(),
  active: boolean().notNull().default(true),
  /** Managed institution type; `type` is its label (Settings → Institution types). */
  typeId: text().notNull().default(''),
  accountingOfficer: jsonb().$type<AccountingOfficer>(),
});

export const users = pgTable('users', {
  id: text().primaryKey(),
  displayName: text().notNull(),
  email: text().notNull().unique(),
  role: text().$type<Role>().notNull(),
  jobTitle: text().notNull().default(''),
  phone: text().notNull().default(''),
  institutionId: text().references(() => institutions.id),
  active: boolean().notNull().default(true),
  /** scrypt hash; the demo marker for seeded accounts; null for accounts invited by link before temporary passwords. */
  passwordHash: text(),
  /**
   * Set while the account still uses the emailed temporary password: it stops working at this
   * time, and the person must choose their own password before using the platform.
   */
  passwordExpiresAt: instant(),
  /** The current single-use invitation or reset link (its token hash only). */
  authLink: jsonb().$type<{
    purpose: 'invitation' | 'reset';
    tokenHash: string;
    expiresAt: string;
  }>(),
});

export const assignments = pgTable('assignments', {
  id: serial().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  officerId: text()
    .notNull()
    .references(() => users.id),
  validFrom: instant().notNull(),
  validTo: instant(),
  reason: text(),
  /** Temporary cover: returns to `returnToOfficerId` at the end of `until` (PRD §5.2). */
  cover: jsonb().$type<{
    until: string;
    returnToOfficerId: string;
    setById: string;
  }>(),
  /** What the previous officer or administrator left for the new officer. */
  handoverNote: text(),
});

/**
 * A supervisor's reassignment suggestion, or an officer's conflict-of-interest declaration.
 * Only the administrator applies or dismisses it (PRD §5.2).
 */
export const suggestions = pgTable('suggestions', {
  id: text().primaryKey(),
  seq: serial(),
  kind: text().$type<'suggestion' | 'conflict_of_interest'>().notNull(),
  requestedByRole: text().$type<'supervisor' | 'officer'>().notNull(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  currentOfficerId: text(),
  suggestedOfficerId: text(),
  reason: text().notNull(),
  suggestedById: text()
    .notNull()
    .references(() => users.id),
  at: instant().notNull(),
  status: text().$type<'open' | 'applied' | 'dismissed'>().notNull(),
  resolvedById: text(),
  resolvedAt: instant(),
  resolutionNote: text(),
});

/** Supervisors are assigned institutions as officers are; history is kept (PRD §5.2). */
export const supervisions = pgTable('supervisions', {
  id: serial().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  supervisorId: text()
    .notNull()
    .references(() => users.id),
  validFrom: instant().notNull(),
  validTo: instant(),
  reason: text(),
});

/* Reporting cycle (FR02, FR03, PRD §7.1) */

export const scoringProfiles = pgTable('scoring_profiles', {
  id: text().primaryKey(),
  /** Library order: seeded profiles first, then copies as they are made. */
  position: serial(),
  name: text().notNull(),
  version: integer().notNull(),
  status: text().$type<'draft' | 'approved' | 'reference'>().notNull(),
  weights: jsonb().$type<IndicatorWeights>().notNull(),
  proceduresMode: text().$type<'scored' | 'prerequisite'>().notNull(),
  checklists: jsonb().$type<ProfileChecklists>().notNull(),
  formulaVersion: text().notNull(),
  rounding: text().$type<'half_up_2dp'>().notNull(),
  simulation: boolean().notNull(),
  sourceNote: text().notNull(),
  basedOn: text(),
  createdAt: instant().notNull(),
  createdBy: text().notNull(),
  approvedAt: instant(),
  approvedBy: text(),
});

export const cycles = pgTable('cycles', {
  id: text().primaryKey(),
  label: text().notNull(),
  timezone: text().notNull(),
  foundationDeadline: instant().notNull(),
  evaluationCutoff: instant().notNull(),
  profileId: text()
    .notNull()
    .references(() => scoringProfiles.id),
  reminderDaysBefore: jsonb().$type<number[]>().notNull(),
  overdueNotice: boolean().notNull(),
  /** Deadline rule, clarification window and public holidays (FR02, PRD §9.1). */
  dayCounting: jsonb().$type<DayCounting>().notNull().default({
    mode: 'calendar',
    reportingDays: 15,
    clarificationDays: 7,
    reviewTargetDays: 10,
    proposalLeadDays: 14,
    holidays: [],
  }),
  /** Labels for the 1–5 risk ratings and their source (O16); set under Forms & scoring. */
  riskScale: jsonb()
    .$type<RiskScale>()
    .notNull()
    .default({
      probability: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'],
      impact: ['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'],
      source:
        'Demonstration labels from common 1–5 risk practice; confirm against the EACC risk assessment template before use.',
    }),
  /** Who issues the cycle's annual report and how it is branded (HP2-65); null until set. */
  reportIdentity: jsonb().$type<ReportIdentity>(),
});

/** Changes to the report identity, for the settings page; each is also audited. */
export const reportIdentityChanges = pgTable('report_identity_changes', {
  id: serial().primaryKey(),
  at: instant().notNull(),
  by: text().notNull(),
  summary: text().notNull(),
});

/**
 * Report logos and signature images (HP2-65). The bytes are in object storage; a published
 * report keeps referring to the image it was published with, so rows are never deleted.
 */
export const reportImages = pgTable('report_images', {
  id: text().primaryKey(),
  bucket: text().notNull(),
  objectKey: text().notNull(),
  mimeType: text().$type<'image/png' | 'image/jpeg'>().notNull(),
  sizeBytes: integer().notNull(),
  sha256: text().notNull(),
  width: integer().notNull(),
  height: integer().notNull(),
  uploadedAt: instant().notNull(),
  uploadedBy: text().notNull(),
});

export const riskScaleChanges = pgTable('risk_scale_changes', {
  id: serial().primaryKey(),
  at: instant().notNull(),
  by: text().notNull(),
  summary: text().notNull(),
  reason: text().notNull(),
});

export const periods = pgTable('periods', {
  id: text().primaryKey(),
  cycleId: text()
    .notNull()
    .references(() => cycles.id),
  quarter: integer().$type<1 | 2 | 3 | 4>().notNull(),
  label: text().notNull(),
  startsOn: date().notNull(),
  endsOn: date().notNull(),
  submissionDeadline: instant().notNull(),
});

export const calendarChanges = pgTable('calendar_changes', {
  id: serial().primaryKey(),
  at: instant().notNull(),
  by: text().notNull(),
  summary: text().notNull(),
  reason: text().notNull(),
});

export const formVersions = pgTable(
  'form_versions',
  {
    id: text().primaryKey(),
    cycleId: text()
      .notNull()
      .references(() => cycles.id),
    version: integer().notNull(),
    title: text().notNull(),
    status: text().$type<'draft' | 'published'>().notNull(),
    publishedAt: instant(),
    periodIds: jsonb().$type<string[]>().notNull(),
    sections: jsonb().$type<FormSection[]>().notNull(),
    weights: jsonb().$type<IndicatorWeights>().notNull(),
    weightsLocked: boolean().notNull(),
    basedOnVersion: integer(),
    updatedAt: instant().notNull(),
    /** Optimistic-concurrency token for draft saves (FR03). */
    revision: integer().notNull().default(0),
    /** Differences from `basedOnVersion`, recomputed on every save and at publication. */
    changes: jsonb().$type<FormChange[]>().notNull().default([]),
  },
  (table) => [unique().on(table.cycleId, table.version)],
);

/** The server clock and run (FR14): one row. */
export const systemState = pgTable('system_state', {
  id: integer().primaryKey().default(1),
  runId: text().notNull(),
  businessTime: instant().notNull(),
  /** Development control: the demo email sink rejects deliveries (AT12). */
  emailFailureMode: boolean().notNull().default(false),
});

/** Clock boundary events already processed in a run: replays are no-ops. */
export const processedEvents = pgTable(
  'processed_events',
  { runId: text().notNull(), eventId: text().notNull() },
  (table) => [primaryKey({ columns: [table.runId, table.eventId] })],
);

/* Plan baseline and foundations (FR04, PRD §10.3–10.4) */

export const risks = pgTable('risks', {
  id: text().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  code: text().notNull(),
  description: text().notNull(),
  cause: text().notNull(),
  probability: integer().notNull(),
  impact: integer().notNull(),
});

/** A mitigation activity from the institution's plan, linked to the risk it treats (FR04). */
export const activities = pgTable('activities', {
  id: text().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  code: text().notNull(),
  riskId: text()
    .notNull()
    .references(() => risks.id),
  title: text().notNull(),
  strategy: text().notNull(),
  output: text().notNull(),
  kpi: text().notNull(),
  target: text().notNull(),
  owner: text().notNull(),
  resourceReference: text().notNull(),
});

/** A milestone the institution plans for a quarter; proposals copy them into baselines. */
export const plannedMilestones = pgTable('planned_milestones', {
  id: text().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  code: text().notNull(),
  activityId: text()
    .notNull()
    .references(() => activities.id),
  periodId: text()
    .notNull()
    .references(() => periods.id),
  title: text().notNull(),
  completionCondition: text().notNull(),
  evidenceExpectation: text().notNull(),
});

/** The institution's own record of who approved its plan, and when (PRD §10.4). */
export const planApprovals = pgTable('plan_approvals', {
  institutionId: text()
    .primaryKey()
    .references(() => institutions.id),
  approvingBody: text().notNull(),
  approvedOn: date().notNull(),
  reference: text().notNull(),
  accountingOfficer: text().notNull(),
  documentVersionId: text(),
  recordedBy: text().notNull(),
  recordedAt: instant().notNull(),
});

/** A baseline version: the locked milestone snapshot for one institution-quarter. */
export const baselines = pgTable(
  'baselines',
  {
    id: text().primaryKey(),
    institutionId: text()
      .notNull()
      .references(() => institutions.id),
    periodId: text()
      .notNull()
      .references(() => periods.id),
    version: integer().notNull(),
    status: text().$type<'proposed' | 'approved' | 'returned'>().notNull(),
    milestones: jsonb().$type<Milestone[]>().notNull(),
    historicalSeed: jsonb().$type<{
      reason: string;
      loadedAt: string;
      confirmedBy: string | null;
      confirmedAt: string | null;
    }>(),
    approval: jsonb().$type<{
      by: string;
      at: string;
      rationale: string;
      checks: {
        materialCoverage: boolean;
        objectiveConditions: boolean;
        mandatoryObligations: boolean;
        noFragmentation: boolean;
      };
    }>(),
    returned: jsonb().$type<{
      by: string;
      at: string;
      reason: string;
      failedChecks: BaselineCheck[];
    }>(),
  },
  (table) => [unique().on(table.institutionId, table.periodId, table.version)],
);

export const amendments = pgTable('amendments', {
  id: text().primaryKey(),
  seq: serial(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  periodId: text()
    .notNull()
    .references(() => periods.id),
  milestoneId: text().notNull(),
  milestoneCode: text().notNull(),
  change: text().$type<'remove' | 'reschedule'>().notNull(),
  toPeriodId: text().references(() => periods.id),
  reason: text().notNull(),
  status: text().$type<'pending' | 'confirmed' | 'declined'>().notNull(),
  requestedBy: text().notNull(),
  requestedAt: instant().notNull(),
  decidedBy: text(),
  decidedAt: instant(),
  decisionReason: text(),
});

/* Quarterly submission (FR04–FR07, PRD §7.2) */

export const obligations = pgTable(
  'obligations',
  {
    id: text().primaryKey(),
    institutionId: text()
      .notNull()
      .references(() => institutions.id),
    periodId: text()
      .notNull()
      .references(() => periods.id),
    state: text()
      .$type<
        | 'not_started'
        | 'draft'
        | 'submitted'
        | 'under_review'
        | 'clarification_requested'
        | 'finalized'
        | 'closed_without_submission'
      >()
      .notNull(),
    currentRevision: integer(),
    firstSubmittedAt: instant(),
    firstCompleteEvidenceAt: instant(),
    lastReceiptAt: instant(),
  },
  (table) => [unique().on(table.institutionId, table.periodId)],
);

/** Private evidence files; foundation documents have no obligation. */
export const evidence = pgTable('evidence', {
  id: text().primaryKey(),
  /** Upload order (IDs share one counter and are not zero-padded far enough to sort). */
  seq: serial(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  obligationId: text().references(() => obligations.id),
  category: text().notNull(),
  fileName: text().notNull(),
  mimeType: text().notNull(),
  sizeBytes: integer().notNull(),
  sha256: text().notNull(),
  demonstration: boolean().notNull().default(false),
  uploadedAt: instant().notNull(),
  uploadedBy: text().notNull(),
  version: integer().notNull(),
  predecessorId: text(),
  supersededBy: text(),
});

/** Private object location; bytes remain nullable only for reads/backfill of older uploads. */
export const evidenceFiles = pgTable(
  'evidence_files',
  {
    evidenceId: text()
      .primaryKey()
      .references(() => evidence.id),
    bytes: bytea(),
    bucket: text(),
    objectKey: text(),
  },
  (table) => [
    check(
      'evidence_files_location',
      sql`(${table.bytes} IS NOT NULL AND ${table.bucket} IS NULL AND ${table.objectKey} IS NULL) OR (${table.bytes} IS NULL AND ${table.bucket} IS NOT NULL AND ${table.objectKey} IS NOT NULL)`,
    ),
    unique('evidence_files_object_unique').on(table.bucket, table.objectKey),
  ],
);

export const foundationVersions = pgTable('foundation_versions', {
  id: text().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  kind: text().$type<FoundationKind>().notNull(),
  version: integer().notNull(),
  evidenceId: text()
    .notNull()
    .references(() => evidence.id),
  approvalReference: text().notNull(),
  effectiveFrom: date().notNull(),
  effectiveTo: date(),
  status: text().$type<'active' | 'superseded' | 'withdrawn'>().notNull(),
  recordedAt: instant().notNull(),
  claimedChecks: jsonb().$type<boolean[]>().notNull(),
  withdrawnReason: text(),
});

export const foundationReviews = pgTable('foundation_reviews', {
  id: serial().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  kind: text().$type<FoundationKind>().notNull(),
  versionId: text()
    .notNull()
    .references(() => foundationVersions.id),
  checks: jsonb()
    .$type<{ outcome: 'pass' | 'fail'; passage: string; reason: string }[]>()
    .notNull(),
  reviewedBy: text().notNull(),
  reviewedAt: instant().notNull(),
});

export const drafts = pgTable('drafts', {
  obligationId: text()
    .primaryKey()
    .references(() => obligations.id),
  formVersionId: text()
    .notNull()
    .references(() => formVersions.id),
  answers: jsonb().$type<ReportAnswers>().notNull(),
  /** Optimistic-concurrency token. */
  version: integer().notNull(),
  savedAt: instant(),
  /** Who saved it last: an institution can have several focal persons. */
  savedBy: text(),
});

/** An immutable submitted revision (PRD §7.2). */
export const submissions = pgTable(
  'submissions',
  {
    id: text().primaryKey(),
    obligationId: text()
      .notNull()
      .references(() => obligations.id),
    revision: integer().notNull(),
    formVersionId: text()
      .notNull()
      .references(() => formVersions.id),
    answers: jsonb().$type<ReportAnswers>().notNull(),
    evidenceIds: jsonb().$type<string[]>().notNull(),
    attestation: jsonb().$type<Attestation>().notNull(),
    receiptId: text().notNull(),
    finalizedAt: instant(),
    finalizedBy: text(),
  },
  (table) => [unique().on(table.obligationId, table.revision)],
);

/** Receipts are immutable snapshots, served exactly as issued. */
export const receipts = pgTable('receipts', {
  id: text().primaryKey(),
  seq: serial(),
  obligationId: text()
    .notNull()
    .references(() => obligations.id),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  receipt: jsonb().$type<Receipt>().notNull(),
});

/** Idempotency-Key → receipt, so a retried submit returns the same receipt (AT06). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: text()
      .notNull()
      .references(() => users.id),
    key: text().notNull(),
    receiptId: text()
      .notNull()
      .references(() => receipts.id),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

/* Review and clarification (FR08–FR10, PRD §7.3) */

/** Append-only: a replaced decision gets `supersededAt` and keeps its record. */
export const decisions = pgTable('decisions', {
  id: text().primaryKey(),
  seq: serial(),
  submissionId: text()
    .notNull()
    .references(() => submissions.id),
  obligationId: text()
    .notNull()
    .references(() => obligations.id),
  milestoneId: text().notNull(),
  outcome: text().$type<'accepted' | 'rejected'>().notNull(),
  reason: text().notNull(),
  revision: integer().notNull(),
  decidedBy: text().notNull(),
  decidedAt: instant().notNull(),
  carriedForwardFrom: text(),
  supersededAt: instant(),
});

/** Officer suitability checks, one current record per evidence version (PRD §9.2, AT30). */
export const suitability = pgTable('suitability', {
  evidenceId: text()
    .primaryKey()
    .references(() => evidence.id),
  checks: jsonb().$type<SuitabilityChecks>().notNull(),
  deficient: boolean().notNull(),
  recordedBy: text().notNull(),
  recordedAt: instant().notNull(),
});

export const clarifications = pgTable('clarifications', {
  id: text().primaryKey(),
  seq: serial(),
  submissionId: text()
    .notNull()
    .references(() => submissions.id),
  obligationId: text()
    .notNull()
    .references(() => obligations.id),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  periodId: text()
    .notNull()
    .references(() => periods.id),
  revision: integer().notNull(),
  items: jsonb().$type<ClarificationItem[]>().notNull(),
  requestedBy: text().notNull(),
  requestedAt: instant().notNull(),
  availableAt: instant().notNull(),
  notifiedAt: instant().notNull(),
  responseDueAt: instant().notNull(),
  /** The window as issued; a later rule change never shortens it. */
  windowDays: integer().notNull().default(7),
  windowUnit: text().$type<DayCountingMode>().notNull().default('calendar'),
  status: text().$type<'open' | 'responded' | 'closed_unanswered'>().notNull(),
  response: jsonb().$type<{ revision: number; submittedAt: string }>(),
  closure: jsonb().$type<{ reason: string; by: string; at: string }>(),
});

export const oversightComments = pgTable('oversight_comments', {
  id: text().primaryKey(),
  seq: serial(),
  obligationId: text()
    .notNull()
    .references(() => obligations.id),
  revision: integer().notNull(),
  author: text().notNull(),
  at: instant().notNull(),
  text: text().notNull(),
  status: text().$type<'open' | 'addressed'>().notNull().default('open'),
  addressedAt: instant(),
  replies: jsonb().$type<OversightComment['replies']>().notNull().default([]),
});

export const reopenings = pgTable('reopenings', {
  id: serial().primaryKey(),
  obligationId: text()
    .notNull()
    .references(() => obligations.id),
  submissionId: text()
    .notNull()
    .references(() => submissions.id),
  reason: text().notNull(),
  by: text().notNull(),
  at: instant().notNull(),
});

/** Quarter closed without submission after the cutoff: a zero disposition with a reason. */
export const closures = pgTable('closures', {
  obligationId: text()
    .primaryKey()
    .references(() => obligations.id),
  reason: text().notNull(),
  by: text().notNull(),
  at: instant().notNull(),
});

/* Annual evaluation (FR12–FR13, PRD §7.4) */

export const extensions = pgTable('extensions', {
  id: serial().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  until: instant().notNull(),
  reason: text().notNull(),
  authorizedBy: text().notNull(),
  recordedBy: text().notNull(),
  recordedAt: instant().notNull(),
});

export const publications = pgTable('publications', {
  id: text().primaryKey(),
  seq: serial(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  version: integer().notNull(),
  batchId: text().notNull(),
  publishedAt: instant().notNull(),
  publishedBy: text().notNull(),
  supersededBy: text(),
  correctionReason: text(),
  profileName: text().notNull(),
  /** Immutable snapshot of the evaluation at release. */
  evaluation: jsonb().notNull(),
  points: text().notNull(),
  /** The report identity in force at release (HP2-65); null for releases made before it existed. */
  identity: jsonb().$type<ReportIdentity>(),
});

export const corrections = pgTable('corrections', {
  id: text().primaryKey(),
  institutionId: text()
    .notNull()
    .references(() => institutions.id),
  periodId: text()
    .notNull()
    .references(() => periods.id),
  reason: text().notNull(),
  openedBy: text().notNull(),
  openedAt: instant().notNull(),
  closedAt: instant(),
});

/* Notifications and audit (FR10–FR11) */

export const notifications = pgTable(
  'notifications',
  {
    id: text().primaryKey(),
    seq: serial(),
    eventId: text().notNull(),
    recipientId: text()
      .notNull()
      .references(() => users.id),
    eventType: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    link: text(),
    createdAt: instant().notNull(),
    readAt: instant(),
  },
  (table) => [unique().on(table.eventId, table.recipientId)],
);

/** Email outbox: unique per event, recipient and channel, so a replay cannot deliver twice. */
export const deliveries = pgTable('deliveries', {
  id: text().primaryKey(),
  seq: serial(),
  key: text().notNull().unique(),
  eventType: text().notNull(),
  recipientId: text()
    .notNull()
    .references(() => users.id),
  recipientName: text().notNull(),
  recipientEmail: text().notNull(),
  recipientRole: text().$type<Role>().notNull(),
  subject: text().notNull(),
  body: text().notNull(),
  status: text()
    .$type<'queued' | 'delivered' | 'retrying' | 'failed'>()
    .notNull(),
  attempts: integer().notNull().default(0),
  lastAttemptAt: instant(),
  lastError: text(),
  /** Real time the delivery worker may next try it; null once delivered or failed. */
  nextAttemptAt: instant(),
});

/** Local stand-in for email (no real recipients). */
export const emailSink = pgTable('email_sink', {
  id: text().primaryKey(),
  seq: serial(),
  to: text().notNull(),
  subject: text().notNull(),
  body: text().notNull(),
  deliveredAt: instant().notNull(),
});

export const auditEvents = pgTable('audit_events', {
  id: text().primaryKey(),
  seq: serial(),
  actorName: text().notNull(),
  actorRole: text().$type<AuditEvent['actorRole']>().notNull(),
  action: text().notNull(),
  objectType: text().notNull(),
  objectId: text().notNull(),
  objectVersion: text(),
  summary: text().notNull(),
  businessTime: instant().notNull(),
  actualTime: instant().notNull(),
});
