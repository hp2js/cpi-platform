import type { Cycle, Institution } from '@cpi/contracts';
import {
  institutions,
  initialAssignments,
  users,
  type MockUser,
} from './seed/cast';
import { cycle, initialBusinessTime } from './seed/cycle';

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
  lastReceiptAt: string | null;
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
}

const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'cpi-mock-db';

function seed(): MockDb {
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
        lastReceiptAt: null,
      })),
    ),
    session: null,
  };
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

/** Restore the seeded fixture state (a new simulation run keeps its ID prefix). */
export function resetDb() {
  db = seed();
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
