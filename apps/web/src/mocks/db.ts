import type {
  Attestation,
  Cycle,
  Decision,
  Draft,
  EvidenceItem,
  EvidenceSuitability,
  OversightComment,
  ReassignmentSuggestion,
  FormVersion,
  InstitutionRecord,
  Receipt,
  ReportAnswers,
} from '@cpi/contracts';
import { initialBaselines, type MockBaseline } from '@cpi/contracts/fixtures';
import {
  initialActivities,
  initialPlanApprovals,
  initialPlannedMilestones,
  initialRisks,
  seedFoundations,
  type MockActivity,
  type MockFoundationReview,
  type MockFoundationVersion,
  type MockPlanApproval,
  type MockPlannedMilestone,
  type MockRisk,
} from '@cpi/contracts/fixtures';
import type {
  AuditEvent,
  Amendment,
  Clarification,
  Role,
} from '@cpi/contracts';
import { initialForm } from '@cpi/contracts/fixtures';
import {
  institutions,
  initialAssignments,
  initialInstitutionTypes,
  initialSupervisions,
  users,
  type MockInstitutionType,
  type MockUser,
} from '@cpi/contracts/fixtures';
import { cycle, initialBusinessTime } from '@cpi/contracts/fixtures';
import { initialProfiles, type MockProfile } from '@cpi/contracts/fixtures';

/**
 * In-memory stand-in for the server's database. In the browser it is persisted to
 * localStorage so a reload keeps demo state, the way a real backend would.
 */
export interface MockObligation {
  id: string;
  institutionId: string;
  periodId: string;
  state:
    | 'not_started'
    | 'draft'
    | 'submitted'
    | 'under_review'
    | 'clarification_requested'
    | 'finalized'
    | 'closed_without_submission';
  currentRevision: number | null;
  firstSubmittedAt: string | null;
  firstCompleteEvidenceAt: string | null;
  lastReceiptAt: string | null;
}

export type MockDecision = Decision & {
  submissionId: string;
  obligationId: string;
};

export interface MockEvidence extends EvidenceItem {
  institutionId: string;
  obligationId: string;
}

/** The public shape of a stored evidence record, without its internal scope keys. */
export function toEvidenceItem(item: MockEvidence): EvidenceItem {
  return {
    id: item.id,
    category: item.category,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256,
    uploadedAt: item.uploadedAt,
    uploadedBy: item.uploadedBy,
    version: item.version,
    predecessorId: item.predecessorId,
    supersededBy: item.supersededBy,
  };
}

/** An immutable submitted revision (PRD §7.2). */
export interface MockSubmission {
  id: string;
  obligationId: string;
  revision: number;
  formVersionId: string;
  answers: ReportAnswers;
  evidenceIds: string[];
  attestation: Attestation;
  receiptId: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

/** Names are resolved when read, so a renamed account shows its current name. */
export type MockSuggestion = Omit<
  ReassignmentSuggestion,
  | 'institutionName'
  | 'currentOfficerName'
  | 'suggestedOfficerName'
  | 'suggestedBy'
  | 'resolvedBy'
> & { suggestedById: string; resolvedById: string | null };

export interface MockDb {
  schemaVersion: number;
  runId: string;
  businessTime: string;
  cycle: Cycle;
  institutions: InstitutionRecord[];
  users: MockUser[];
  assignments: typeof initialAssignments;
  /** Supervisor per institution, with history (a supervisor sees only these institutions). */
  supervisions: typeof initialSupervisions;
  /** Supervisors' reassignment suggestions for the administrator. */
  suggestions: MockSuggestion[];
  obligations: MockObligation[];
  session: { userId: string; expired: boolean } | null;
  forms: FormVersion[];
  baselines: MockBaseline[];
  drafts: Draft[];
  evidence: MockEvidence[];
  submissions: MockSubmission[];
  receipts: Receipt[];
  decisions: MockDecision[];
  /** Idempotency-Key → receipt ID, so a retried submit returns the same receipt (AT06). */
  idempotency: Record<string, string>;
  sequence: number;
  clarifications: Omit<Clarification, 'overdue' | 'extensionRequired'>[];
  reopenings: {
    obligationId: string;
    submissionId: string;
    reason: string;
    by: string;
    at: string;
  }[];
  notifications: MockNotification[];
  deliveries: MockDelivery[];
  emailSink: {
    id: string;
    to: string;
    subject: string;
    body: string;
    deliveredAt: string;
  }[];
  /** Development control: when set, the demo email sink rejects deliveries (AT12). */
  emailFailureMode: boolean;
  audit: AuditEvent[];
  /** The institution's own record of its plan approval (FR04). */
  planApprovals: MockPlanApproval[];
  risks: MockRisk[];
  activities: MockActivity[];
  plannedMilestones: MockPlannedMilestone[];
  amendments: Amendment[];
  foundationVersions: MockFoundationVersion[];
  foundationReviews: MockFoundationReview[];
  /** Clock boundary events already processed in this run (FR14: replays are no-ops). */
  processedEvents: string[];
  closures: { obligationId: string; reason: string; by: string; at: string }[];
  publications: MockPublication[];
  corrections: {
    id: string;
    institutionId: string;
    periodId: string;
    reason: string;
    openedBy: string;
    openedAt: string;
    closedAt: string | null;
  }[];
  /** Officer suitability checks per evidence version (PRD §9.2, AT30). */
  suitability: EvidenceSuitability[];
  comments: (OversightComment & { obligationId: string })[];
  /** Authorized institution-specific evaluation extensions (PRD §7.3, AT29). */
  extensions: {
    institutionId: string;
    until: string;
    reason: string;
    authorizedBy: string;
    recordedBy: string;
    recordedAt: string;
  }[];
  /** Administrator settings (PRD §7.1, FR01, FR02). Profiles survive a new simulation run. */
  profiles: MockProfile[];
  cycleProfileId: string;
  reminders: { daysBefore: number[]; overdueNotice: boolean };
  calendarChanges: {
    at: string;
    by: string;
    summary: string;
    reason: string;
  }[];
  riskScaleChanges: MockDb['calendarChanges'];
  institutionTypes: MockInstitutionType[];
  /** Failed sign-ins per email (actual time), for throttling (PRD §13.1). */
  loginAttempts: Record<
    string,
    { failures: number[]; lockedUntil: number | null }
  >;
}

export interface MockPublication {
  id: string;
  institutionId: string;
  version: number;
  batchId: string;
  publishedAt: string;
  publishedBy: string;
  supersededBy: string | null;
  correctionReason: string | null;
  profileName: string;
  /** Immutable snapshot of the evaluation at release. */
  evaluation: unknown;
  points: string;
}

export interface MockNotification {
  id: string;
  eventId: string;
  recipientId: string;
  eventType: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface MockDelivery {
  id: string;
  /** Unique event–recipient–channel key: a replayed event cannot deliver twice (FR11). */
  key: string;
  eventType: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  recipientRole: Role;
  subject: string;
  body: string;
  status: 'queued' | 'delivered' | 'retrying' | 'failed';
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

/**
 * Bump whenever stored records change shape: browsers keep the demo data in localStorage, and
 * an older copy would otherwise be served to screens that expect the new fields. A different
 * version makes every browser start again from the seed. `db.test.ts` compares the seed's
 * shape with `SCHEMA_SHAPE` so a change cannot go unnoticed.
 * 14: assignment cover and handover notes, draft `savedBy`, reassignment request kinds.
 * 15: institution-owned plans: activities, planned milestones, plan approvals, milestone
 * `activityId`, returned baselines' failed checks, proposal lead days.
 * 16: the cycle's declared risk scale labels.
 * 17: the risk scale's change log.
 * 18: form versions' draft revision and change summary; checklist and repeated-row answers.
 */
export const SCHEMA_VERSION = 18;
/** `${version}:${shape}` of the seed this version describes. */
export const SCHEMA_SHAPE = '18:939f14ad';
const STORAGE_KEY = 'cpi-mock-db';

/** The keys of every record in the seed, as one string: changes when a record gains a field. */
export function shapeSignature(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.length ? shapeSignature(value[0]) : ''}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${key}:${shapeSignature((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return typeof value;
}

/** A short, stable hash of the seed's shape (djb2). */
export function schemaShape() {
  let hash = 5381;
  for (const character of shapeSignature(seed()))
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}

function seed(): MockDb {
  const foundations = seedFoundations();
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: 'run-001',
    businessTime: initialBusinessTime,
    cycle: structuredClone(cycle),
    institutions: structuredClone(institutions),
    users: structuredClone(users),
    assignments: structuredClone(initialAssignments),
    supervisions: structuredClone(initialSupervisions),
    suggestions: [],
    obligations: institutions.flatMap((institution) =>
      cycle.periods.map((period) => ({
        id: `${institution.id}:${period.id}`,
        institutionId: institution.id,
        periodId: period.id,
        state: 'not_started' as const,
        currentRevision: null,
        firstSubmittedAt: null,
        firstCompleteEvidenceAt: null,
        lastReceiptAt: null,
      })),
    ),
    session: null,
    forms: [structuredClone(initialForm)],
    baselines: structuredClone(initialBaselines),
    drafts: [],
    submissions: [],
    receipts: [],
    decisions: [],
    idempotency: {},
    sequence: 0,
    clarifications: [],
    reopenings: [],
    notifications: [],
    deliveries: [],
    emailSink: [],
    emailFailureMode: false,
    audit: [],
    planApprovals: structuredClone(initialPlanApprovals),
    risks: structuredClone(initialRisks),
    activities: structuredClone(initialActivities),
    plannedMilestones: structuredClone(initialPlannedMilestones),
    amendments: [],
    foundationVersions: foundations.versions,
    foundationReviews: [],
    processedEvents: [],
    closures: [],
    publications: [],
    corrections: [],
    evidence: foundations.evidence,
    suitability: [],
    comments: [],
    extensions: [],
    profiles: structuredClone(initialProfiles),
    cycleProfileId: 'hackathon-mock-v1',
    reminders: { daysBefore: [7, 1], overdueNotice: true },
    calendarChanges: [],
    riskScaleChanges: [],
    institutionTypes: structuredClone(initialInstitutionTypes),
    loginAttempts: {},
  };
}

/** Monotonic identifier, stable across reloads of the persisted store. */
export function nextId(prefix: string) {
  db.sequence += 1;
  return `${prefix}-${String(db.sequence).padStart(4, '0')}`;
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function load(): MockDb {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as MockDb) : undefined;
    if (parsed?.schemaVersion === SCHEMA_VERSION) return parsed;
  } catch {
    /* corrupt or unavailable storage: start from the seed */
  }
  return seed();
}

let db = load();

// Behave like one shared server across tabs: another tab's write replaces this tab's copy.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) db = load();
  });
}

export function getDb(): MockDb {
  return db;
}

/** Apply a change and persist it, like a committed transaction. */
export function commit(change: (db: MockDb) => void) {
  change(db);
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked: state stays in memory for this tab */
  }
}

/**
 * Restore the seeded fixture state. A new simulation run passes `keepProfiles` so the
 * administrator's profile library carries over; the development reset restores everything.
 */
export function resetDb(options: { keepProfiles?: boolean } = {}) {
  const profiles = db.profiles;
  db = seed();
  if (options.keepProfiles) db.profiles = profiles;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
