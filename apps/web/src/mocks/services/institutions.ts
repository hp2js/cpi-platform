import {
  institutionImportColumns,
  type AccountingOfficer,
  type InstitutionCreate,
  type InstitutionImportPreview,
  type Institution,
} from '@cpi/contracts';
import type { MockDb } from '../db';
import { committee, type MockBaseline } from '@cpi/contracts/fixtures';
import type { MockUser } from '@cpi/contracts/fixtures';
import { accountStatus, sendInvitation, type PreparedInvitation } from './auth';
import { parseCsv } from '@cpi/contracts';

/**
 * Onboarding institutions (FR01), one at a time or in bulk. Every new institution gets its
 * four obligations and a reviewing officer, and an empty plan: the institution records its
 * risks, activities and milestones and proposes each quarter's baseline (FR04). For quarters
 * already open, a simulation-only SEEDED HISTORICAL BASELINE (PRD §10.4) holding the committee
 * milestones is loaded when requested, otherwise none, which leaves them pending approval.
 */

const ID_PATTERN = /^[A-Z]+-\d{3}$/;
const EMAIL_PATTERN = /^[^@\s]+@example\.invalid$/;

export interface NewInstitution {
  id: string;
  name: string;
  /** Resolved against the managed list; undefined when unknown or retired. */
  typeId: string | undefined;
  /** What the request gave, for error messages. */
  typeInput: string;
  /** Null: no reviewing officer yet. Undefined: one was named but no active officer matches. */
  officer: MockUser | null | undefined;
  officerInput: string;
  /** Null: no supervisor. Undefined: one was named but no active supervisor matches. */
  supervisor: MockUser | null | undefined;
  supervisorInput: string;
  accountingOfficer: AccountingOfficer;
  focalUser: { displayName: string; email: string; jobTitle: string } | null;
}

export function accountingOfficerProblems(officer: AccountingOfficer) {
  const errors: string[] = [];
  if (officer.name.trim().length < 3)
    errors.push('Give the Accounting Officer’s name.');
  if (officer.designation.trim().length < 2)
    errors.push('Give the Accounting Officer’s designation.');
  if (officer.email && !EMAIL_PATTERN.test(officer.email.trim().toLowerCase()))
    errors.push(
      'The Accounting Officer’s email must be a fictional @example.invalid address.',
    );
  return errors;
}

/** Matches an active type by ID or by label, ignoring case. */
export function activeTypeId(db: MockDb, reference: string) {
  const key = reference.trim().toLowerCase();
  return db.institutionTypes.find(
    (type) =>
      type.active &&
      (type.id === reference || type.label.toLowerCase() === key),
  )?.id;
}

/** Problems with one institution; `taken` holds IDs and emails claimed earlier in the batch. */
export function institutionProblems(
  db: MockDb,
  input: NewInstitution,
  taken: { ids: Set<string>; emails: Set<string> } = {
    ids: new Set(),
    emails: new Set(),
  },
) {
  const errors: string[] = [];
  if (input.supervisor === undefined)
    errors.push(`No active supervisor matches ${input.supervisorInput}.`);
  if (!ID_PATTERN.test(input.id))
    errors.push(
      'The ID needs capital letters, a hyphen and three digits, e.g. MDA-123.',
    );
  else if (
    db.institutions.some((item) => item.id === input.id) ||
    taken.ids.has(input.id)
  )
    errors.push(`${input.id} is already in use.`);
  if (input.name.trim().length < 3)
    errors.push('Give a name of at least 3 characters.');
  else if (
    db.institutions.some(
      (item) =>
        item.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
    )
  )
    errors.push(`An institution named “${input.name}” already exists.`);
  if (!input.typeId)
    errors.push(
      input.typeInput
        ? `“${input.typeInput}” is not an active institution type. Use one of: ${db.institutionTypes
            .filter((type) => type.active)
            .map((type) => type.label)
            .join(', ')}.`
        : 'Choose the institution type.',
    );
  errors.push(...accountingOfficerProblems(input.accountingOfficer));
  if (input.officer === undefined)
    errors.push(`No active prevention officer matches ${input.officerInput}.`);
  if (input.focalUser) {
    const email = input.focalUser.email.toLowerCase();
    if (!EMAIL_PATTERN.test(email))
      errors.push(
        'The focal email must be a fictional @example.invalid address.',
      );
    else if (
      db.users.some((user) => user.email.toLowerCase() === email) ||
      taken.emails.has(email)
    )
      errors.push(`${input.focalUser.email} already has an account.`);
    if (input.focalUser.displayName.trim().length < 3)
      errors.push('Give the focal person’s name.');
  }
  return errors;
}

export function activeOfficer(db: MockDb, reference: string) {
  const key = reference.trim().toLowerCase();
  return db.users.find(
    (user) =>
      user.role === 'officer' &&
      user.active &&
      (user.id === reference || user.email.toLowerCase() === key),
  );
}

export function activeSupervisor(db: MockDb, reference: string) {
  const key = reference.trim().toLowerCase();
  return db.users.find(
    (user) =>
      user.role === 'supervisor' &&
      user.active &&
      (user.id === reference || user.email.toLowerCase() === key),
  );
}

/** With exactly one active supervisor, new institutions go to them unless told otherwise. */
export function defaultSupervisor(db: MockDb) {
  const active = db.users.filter(
    (user) => user.role === 'supervisor' && user.active,
  );
  return active.length === 1 ? active[0]! : null;
}

const opensAt = (endsOn: string) =>
  Date.parse(`${endsOn}T23:59:59+03:00`) + 1000;

/** Creates the institution and everything it needs. Call inside `commit`. */
export function createInstitution(
  db: MockDb,
  admin: MockUser,
  input: NewInstitution & { officer: MockUser | null },
  seedOpenedQuarters: boolean,
  nextId: (prefix: string) => string,
  invitation?: PreparedInvitation,
) {
  const now = Date.parse(db.businessTime);
  const type = db.institutionTypes.find((item) => item.id === input.typeId)!;
  db.institutions.push({
    id: input.id,
    name: input.name.trim(),
    typeId: type.id,
    type: type.label,
    active: true,
    accountingOfficer: {
      name: input.accountingOfficer.name.trim(),
      designation: input.accountingOfficer.designation.trim(),
      email: input.accountingOfficer.email.trim().toLowerCase(),
      phone: input.accountingOfficer.phone.trim(),
    },
  });
  if (input.officer)
    db.assignments.push({
      institutionId: input.id,
      officerId: input.officer.id,
      validFrom: db.businessTime,
      validTo: null,
      reason: 'Initial assignment on onboarding',
      cover: null,
      handoverNote: null,
    });
  if (input.supervisor)
    db.supervisions.push({
      institutionId: input.id,
      supervisorId: input.supervisor.id,
      validFrom: db.businessTime,
      validTo: null,
      reason: 'Initial supervision on onboarding',
    });
  for (const period of db.cycle.periods) {
    db.obligations.push({
      id: `${input.id}:${period.id}`,
      institutionId: input.id,
      periodId: period.id,
      state: 'not_started',
      currentRevision: null,
      firstSubmittedAt: null,
      firstCompleteEvidenceAt: null,
      lastReceiptAt: null,
    });
    // Quarters still ahead start empty: the institution records its plan and proposes each
    // baseline itself (FR04). Only opened quarters can be loaded as historical seeds.
    const opened = now >= opensAt(period.endsOn);
    if (!opened || !seedOpenedQuarters) continue;
    const code = (offset: number) =>
      `M-${String(2 * (period.quarter - 1) + offset).padStart(2, '0')}`;
    const baseline: MockBaseline = {
      id: `bl-${input.id}-${period.label}-v1`,
      institutionId: input.id,
      periodId: period.id,
      version: 1,
      returned: null,
      milestones: committee(input.id, code(1), code(2)),
      status: 'approved',
      historicalSeed: {
        reason:
          'Seeded historical baseline for the simulated year, loaded on onboarding because the quarter had already opened.',
        loadedAt: db.businessTime,
        confirmedBy: null,
        confirmedAt: null,
      },
      approval: {
        by: `${admin.displayName} (onboarding load)`,
        at: db.businessTime,
        rationale:
          'Loaded on onboarding for the simulated year; correspondence with the approved plan awaits officer confirmation.',
        checks: {
          materialCoverage: true,
          objectiveConditions: true,
          mandatoryObligations: true,
          noFragmentation: true,
        },
      },
    };
    db.baselines.push(baseline);
  }
  if (input.focalUser) {
    const focal: MockUser = {
      id: nextId('user'),
      displayName: input.focalUser.displayName.trim(),
      email: input.focalUser.email.trim().toLowerCase(),
      role: 'institution',
      institutionId: input.id,
      active: true,
      jobTitle: input.focalUser.jobTitle.trim(),
      passwordHash: null,
    };
    db.users.push(focal);
    if (invitation) sendInvitation(db, focal, invitation, admin);
  }
}

export function fromCreateRequest(
  db: MockDb,
  request: InstitutionCreate,
): NewInstitution {
  return {
    id: request.id,
    name: request.name,
    typeId: activeTypeId(db, request.typeId),
    typeInput: request.typeId,
    officer: request.officerId ? activeOfficer(db, request.officerId) : null,
    officerInput: request.officerId ?? '',
    supervisor: request.supervisorId
      ? activeSupervisor(db, request.supervisorId)
      : null,
    supervisorInput: request.supervisorId ?? '',
    accountingOfficer: request.accountingOfficer,
    focalUser: request.focalUser,
  };
}

/** Parses and validates an import file as a whole; nothing is created here. */
export function previewImport(
  db: MockDb,
  csv: string,
): { preview: InstitutionImportPreview; rows: NewInstitution[] } {
  const [header = [], ...lines] = parseCsv(csv);
  const columns = header.map((name) => name.trim().toLowerCase());
  const missing = institutionImportColumns
    .filter((column) =>
      ['institution_id', 'name', 'type', 'ao_name', 'ao_designation'].includes(
        column,
      ),
    )
    .filter((column) => !columns.includes(column));
  const fileErrors: string[] = [];
  if (missing.length)
    fileErrors.push(`Missing columns: ${missing.join(', ')}.`);
  if (!lines.length) fileErrors.push('The file has no institution rows.');
  if (lines.length > 1000)
    fileErrors.push('Import at most 1,000 institutions at a time.');
  if (fileErrors.length)
    return {
      preview: { fileErrors, rows: [], valid: 0, invalid: 0 },
      rows: [],
    };

  const cell = (cells: string[], column: string) =>
    cells[columns.indexOf(column)]?.trim() ?? '';
  const taken = { ids: new Set<string>(), emails: new Set<string>() };
  const rows: NewInstitution[] = [];
  const previewRows = lines.map((cells, index) => {
    const focalEmail = cell(cells, 'focal_email');
    const focalName = cell(cells, 'focal_name');
    const typeInput = cell(cells, 'type');
    const officerInput = cell(cells, 'officer_email');
    const supervisorInput = columns.includes('supervisor_email')
      ? cell(cells, 'supervisor_email')
      : '';
    const input: NewInstitution = {
      id: cell(cells, 'institution_id').toUpperCase(),
      name: cell(cells, 'name'),
      typeId: activeTypeId(db, typeInput),
      typeInput,
      officer: officerInput ? activeOfficer(db, officerInput) : null,
      officerInput,
      supervisor: supervisorInput
        ? activeSupervisor(db, supervisorInput)
        : defaultSupervisor(db),
      supervisorInput,
      accountingOfficer: {
        name: cell(cells, 'ao_name'),
        designation: cell(cells, 'ao_designation'),
        email: cell(cells, 'ao_email'),
        phone: cell(cells, 'ao_phone'),
      },
      focalUser:
        focalEmail || focalName
          ? { displayName: focalName, email: focalEmail, jobTitle: '' }
          : null,
    };
    const errors = institutionProblems(db, input, taken);
    if (cells.length > columns.length)
      errors.push('The row has more cells than the header.');
    taken.ids.add(input.id);
    if (input.focalUser) taken.emails.add(input.focalUser.email.toLowerCase());
    rows.push(input);
    return {
      line: index + 2,
      institutionId: input.id,
      name: input.name,
      type: input.typeId
        ? db.institutionTypes.find((type) => type.id === input.typeId)!.label
        : input.typeInput,
      officerName: input.officer?.displayName ?? null,
      supervisorName: input.supervisor?.displayName ?? null,
      focalEmail: input.focalUser?.email || null,
      errors,
    };
  });
  const invalid = previewRows.filter((row) => row.errors.length).length;
  return {
    preview: {
      fileErrors,
      rows: previewRows,
      valid: previewRows.length - invalid,
      invalid,
    },
    rows,
  };
}

/** Focal persons who have set up their account and can sign in (invited ones cannot yet). */
export function activeFocalPersons(db: MockDb, institutionId: string) {
  return db.users.filter(
    (user) =>
      user.role === 'institution' &&
      user.institutionId === institutionId &&
      accountStatus(user) === 'active',
  );
}

export function toInstitution(
  db: MockDb,
  record: MockDb['institutions'][number],
): Institution {
  return {
    ...record,
    activeFocalPersons: activeFocalPersons(db, record.id).length,
  } as Institution;
}
