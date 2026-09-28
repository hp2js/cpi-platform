import type {
  Attestation,
  Cycle,
  Decision,
  Draft,
  EvidenceItem,
  EvidenceSuitability,
  OversightComment,
  FormVersion,
  Institution,
  Receipt,
  ReportAnswers,
} from '@cpi/contracts';
import { initialBaselines, type MockBaseline } from '@cpi/contracts/fixtures';
import {
  approvedPlanReference,
  initialRisks,
  seedFoundations,
  type MockFoundationReview,
  type MockFoundationVersion,
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

export interface MockDb {
  schemaVersion: number;
  runId: string;
  businessTime: string;
  cycle: Cycle;
  institutions: Institution[];
  users: MockUser[];
  assignments: typeof initialAssignments;
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
  planReference: string;
  risks: MockRisk[];
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

const SCHEMA_VERSION = 12;
const STORAGE_KEY = 'cpi-mock-db';

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
    planReference: approvedPlanReference,
    risks: structuredClone(initialRisks),
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
