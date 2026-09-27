import {
  institutionImportColumns,
  type InstitutionCreate,
  type InstitutionImportPreview,
} from '@cpi/contracts';
import type { MockDb } from '../db';
import { committee, type MockBaseline } from '../seed/baselines';
import type { MockUser } from '../seed/cast';
import { parseCsv } from './csv';

/**
 * Onboarding institutions (FR01), one at a time or in bulk. Every new institution gets its
 * four obligations and a reviewing officer. Its baselines hold the mandatory committee
 * milestones: proposed for quarters still to open, so the officer approves them as usual;
 * for quarters already open, a simulation-only SEEDED HISTORICAL BASELINE (PRD §10.4) when
 * requested, otherwise none, which leaves those quarters pending baseline approval.
 */

const ID_PATTERN = /^[A-Z]+-\d{3}$/;
const EMAIL_PATTERN = /^[^@\s]+@example\.invalid$/;

export interface NewInstitution {
  id: string;
  name: string;
  type: string;
  officer: MockUser | undefined;
  focalContact: string;
  accountingOfficerContact: string;
  focalUser: { displayName: string; email: string } | null;
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
  if (input.type.trim().length < 3) errors.push('Give the institution type.');
  if (!input.officer) errors.push('Choose an active prevention officer.');
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

const opensAt = (endsOn: string) =>
  Date.parse(`${endsOn}T23:59:59+03:00`) + 1000;

/** Creates the institution and everything it needs. Call inside `commit`. */
export function createInstitution(
  db: MockDb,
  admin: MockUser,
  input: NewInstitution & { officer: MockUser },
  seedOpenedQuarters: boolean,
  nextId: (prefix: string) => string,
) {
  const now = Date.parse(db.businessTime);
  db.institutions.push({
    id: input.id,
    name: input.name.trim(),
    type: input.type.trim(),
    active: true,
  });
  db.institutionContacts[input.id] = {
    focalContact: input.focalContact.trim(),
    accountingOfficerContact: input.accountingOfficerContact.trim(),
  };
  db.assignments.push({
    institutionId: input.id,
    officerId: input.officer.id,
    validFrom: db.businessTime,
    validTo: null,
    reason: 'Initial assignment on onboarding',
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
    const opened = now >= opensAt(period.endsOn);
    if (opened && !seedOpenedQuarters) continue;
    const code = (offset: number) =>
      `M-${String(2 * (period.quarter - 1) + offset).padStart(2, '0')}`;
    const baseline: MockBaseline = {
      id: `bl-${input.id}-${period.label}-v1`,
      institutionId: input.id,
      periodId: period.id,
      version: 1,
      returned: null,
      milestones: committee(input.id, code(1), code(2)),
      status: opened ? 'approved' : 'proposed',
      historicalSeed: opened
        ? {
            reason:
              'SEEDED HISTORICAL BASELINE for the simulated year, loaded on onboarding because the quarter had already opened.',
            loadedAt: db.businessTime,
            confirmedBy: null,
            confirmedAt: null,
          }
        : null,
      approval: opened
        ? {
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
          }
        : null,
    };
    db.baselines.push(baseline);
  }
  if (input.focalUser)
    db.users.push({
      id: nextId('user'),
      displayName: input.focalUser.displayName.trim(),
      email: input.focalUser.email.trim().toLowerCase(),
      role: 'institution',
      institutionId: input.id,
      active: true,
    });
}

export function fromCreateRequest(
  db: MockDb,
  request: InstitutionCreate,
): NewInstitution {
  return {
    id: request.id,
    name: request.name,
    type: request.type,
    officer: activeOfficer(db, request.officerId),
    focalContact: request.focalContact,
    accountingOfficerContact: request.accountingOfficerContact,
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
      ['institution_id', 'name', 'type', 'officer_email'].includes(column),
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
    const input: NewInstitution = {
      id: cell(cells, 'institution_id').toUpperCase(),
      name: cell(cells, 'name'),
      type: cell(cells, 'type'),
      officer: activeOfficer(db, cell(cells, 'officer_email')),
      focalContact: cell(cells, 'focal_contact'),
      accountingOfficerContact: cell(cells, 'accounting_officer_contact'),
      focalUser:
        focalEmail || focalName
          ? { displayName: focalName, email: focalEmail }
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
      type: input.type,
      officerName: input.officer?.displayName ?? null,
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
