import {
  FICTIONAL_EMAIL,
  institutionImportColumns,
  parseCsv,
  type AccountingOfficer,
  type InstitutionCreate,
  type InstitutionImportPreview,
} from '@cpi/contracts';
import { committee } from '@cpi/contracts/fixtures';
import type { Invite } from '../auth/invitations';
import type { User } from '../auth/sessions';
import { nextId, type Db, type Tx } from '../database/db';
import {
  assignments,
  baselines,
  institutionTypes,
  institutions,
  obligations,
  supervisions,
  users,
} from '../database/schema';
import { loadCycle } from '../database/state';

/*
 * Onboarding institutions (FR01), one at a time or in bulk, ported from the mock API's
 * services/institutions.ts. Every new institution gets its four obligations and a reviewing
 * officer, and an empty plan: the institution records its risks, activities and milestones and
 * proposes each quarter's baseline (FR04). For quarters already open, a simulation-only SEEDED
 * HISTORICAL BASELINE (PRD §10.4) of the committee milestones when requested, otherwise none.
 */

const ID_PATTERN = /^[A-Z]+-\d{3}$/;
const EMAIL_PATTERN = /^[^@\s]+@example\.invalid$/;

/**
 * What validation needs to know about existing records, loaded once per request.
 * `fictionalEmails`: demo deployments accept only @example.invalid sign-in addresses.
 */
export async function directorySnapshot(db: Db, fictionalEmails: boolean) {
  const [institutionRows, userRows, typeRows] = await Promise.all([
    db.select().from(institutions),
    db.select().from(users),
    db.select().from(institutionTypes).orderBy(institutionTypes.position),
  ]);
  return {
    institutions: institutionRows,
    users: userRows,
    types: typeRows,
    fictionalEmails,
  };
}
export type Snapshot = Awaited<ReturnType<typeof directorySnapshot>>;

export interface NewInstitution {
  id: string;
  name: string;
  /** Resolved against the managed list; undefined when unknown or retired. */
  typeId: string | undefined;
  /** What the request gave, for error messages. */
  typeInput: string;
  /** Null: no reviewing officer yet. Undefined: one was named but no active officer matches. */
  officer: User | null | undefined;
  officerInput: string;
  /** Null: no supervisor. Undefined: one was named but no active supervisor matches. */
  supervisor: User | null | undefined;
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
function activeTypeId(snapshot: Snapshot, reference: string) {
  const key = reference.trim().toLowerCase();
  return snapshot.types.find(
    (type) =>
      type.active &&
      (type.id === reference || type.label.toLowerCase() === key),
  )?.id;
}

function activeUser(snapshot: Snapshot, role: User['role'], reference: string) {
  const key = reference.trim().toLowerCase();
  return snapshot.users.find(
    (user) =>
      user.role === role &&
      user.active &&
      (user.id === reference || user.email.toLowerCase() === key),
  );
}

/** With exactly one active supervisor, new institutions go to them unless told otherwise. */
function defaultSupervisor(snapshot: Snapshot) {
  const active = snapshot.users.filter(
    (user) => user.role === 'supervisor' && user.active,
  );
  return active.length === 1 ? active[0]! : null;
}

/** Problems with one institution; `taken` holds IDs and emails claimed earlier in the batch. */
export function institutionProblems(
  snapshot: Snapshot,
  input: NewInstitution,
  taken = { ids: new Set<string>(), emails: new Set<string>() },
) {
  const errors: string[] = [];
  if (input.supervisor === undefined)
    errors.push(`No active supervisor matches ${input.supervisorInput}.`);
  if (!ID_PATTERN.test(input.id))
    errors.push(
      'The ID needs capital letters, a hyphen and three digits, e.g. MDA-123.',
    );
  else if (
    snapshot.institutions.some((item) => item.id === input.id) ||
    taken.ids.has(input.id)
  )
    errors.push(`${input.id} is already in use.`);
  if (input.name.trim().length < 3)
    errors.push('Give a name of at least 3 characters.');
  else if (
    snapshot.institutions.some(
      (item) =>
        item.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
    )
  )
    errors.push(`An institution named “${input.name}” already exists.`);
  if (!input.typeId)
    errors.push(
      input.typeInput
        ? `“${input.typeInput}” is not an active institution type. Use one of: ${snapshot.types
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      errors.push('The focal email is not a valid email address.');
    else if (snapshot.fictionalEmails && !FICTIONAL_EMAIL.test(email))
      errors.push(
        'The focal email must be a fictional @example.invalid address.',
      );
    else if (
      snapshot.users.some((user) => user.email.toLowerCase() === email) ||
      taken.emails.has(email)
    )
      errors.push(`${input.focalUser.email} already has an account.`);
    if (input.focalUser.displayName.trim().length < 3)
      errors.push('Give the focal person’s name.');
  }
  return errors;
}

export function fromCreateRequest(
  snapshot: Snapshot,
  request: InstitutionCreate,
): NewInstitution {
  return {
    id: request.id,
    name: request.name,
    typeId: activeTypeId(snapshot, request.typeId),
    typeInput: request.typeId,
    officer: request.officerId
      ? activeUser(snapshot, 'officer', request.officerId)
      : null,
    officerInput: request.officerId ?? '',
    supervisor: request.supervisorId
      ? activeUser(snapshot, 'supervisor', request.supervisorId)
      : null,
    supervisorInput: request.supervisorId ?? '',
    accountingOfficer: request.accountingOfficer,
    focalUser: request.focalUser,
  };
}

/** Parses and validates an import file as a whole; nothing is created here. */
export function previewImport(
  snapshot: Snapshot,
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
      typeId: activeTypeId(snapshot, typeInput),
      typeInput,
      officer: officerInput
        ? activeUser(snapshot, 'officer', officerInput)
        : null,
      officerInput,
      supervisor: supervisorInput
        ? activeUser(snapshot, 'supervisor', supervisorInput)
        : defaultSupervisor(snapshot),
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
    const errors = institutionProblems(snapshot, input, taken);
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
        ? snapshot.types.find((type) => type.id === input.typeId)!.label
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

const opensAt = (endsOn: string) =>
  Date.parse(`${endsOn}T23:59:59+03:00`) + 1000;

/** Creates the institution and everything it needs. Call inside `write()`. */
export async function createInstitution(
  tx: Tx,
  businessTime: string,
  invite: Invite,
  admin: User,
  snapshot: Snapshot,
  input: NewInstitution & { officer: User | null },
  seedOpenedQuarters: boolean,
) {
  const now = Date.parse(businessTime);
  const type = snapshot.types.find((item) => item.id === input.typeId)!;
  const cycle = await loadCycle(tx);
  await tx.insert(institutions).values({
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
    await tx.insert(assignments).values({
      institutionId: input.id,
      officerId: input.officer.id,
      validFrom: businessTime,
      validTo: null,
      reason: 'Initial assignment on onboarding',
    });
  if (input.supervisor)
    await tx.insert(supervisions).values({
      institutionId: input.id,
      supervisorId: input.supervisor.id,
      validFrom: businessTime,
      validTo: null,
      reason: 'Initial supervision on onboarding',
    });
  for (const period of cycle.periods) {
    await tx.insert(obligations).values({
      id: `${input.id}:${period.id}`,
      institutionId: input.id,
      periodId: period.id,
      state: 'not_started',
    });
    // Quarters still ahead start empty: the institution proposes each baseline itself (FR04).
    const opened = now >= opensAt(period.endsOn);
    if (!opened || !seedOpenedQuarters) continue;
    const code = (offset: number) =>
      `M-${String(2 * (period.quarter - 1) + offset).padStart(2, '0')}`;
    await tx.insert(baselines).values({
      id: `bl-${input.id}-${period.label}-v1`,
      institutionId: input.id,
      periodId: period.id,
      version: 1,
      returned: null,
      milestones: committee(input.id, code(1), code(2)),
      status: 'approved',
      historicalSeed: {
        reason:
          'SEEDED HISTORICAL BASELINE for the simulated year, loaded on onboarding because the quarter had already opened.',
        loadedAt: businessTime,
        confirmedBy: null,
        confirmedAt: null,
      },
      approval: {
        by: `${admin.displayName} (onboarding load)`,
        at: businessTime,
        rationale:
          'Loaded on onboarding for the simulated year; correspondence with the approved plan awaits officer confirmation.',
        checks: {
          materialCoverage: true,
          objectiveConditions: true,
          mandatoryObligations: true,
          noFragmentation: true,
        },
      },
    });
  }
  if (input.focalUser) {
    const [focal] = await tx
      .insert(users)
      .values({
        id: await nextId(tx, 'user'),
        displayName: input.focalUser.displayName.trim(),
        email: input.focalUser.email.trim().toLowerCase(),
        role: 'institution',
        institutionId: input.id,
        active: true,
        jobTitle: input.focalUser.jobTitle.trim(),
        passwordHash: null,
      })
      .returning();
    await invite(tx, focal!);
  }
}
