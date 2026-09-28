import type { InstitutionRecord, Role } from '@cpi/contracts';

/** Fictional cast from PRD §17.1. No record represents a real institution or person. */
export interface MockUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  institutionId?: string;
  active: boolean;
  jobTitle?: string;
  phone?: string;
  /** Salted hash; `demo-password` marks seeded accounts that accept the published demo password; null until an invited person sets one. */
  passwordHash?: string | null;
  /** The current single-use invitation or reset link (its token hash only). */
  authLink?: {
    purpose: 'invitation' | 'reset';
    tokenHash: string;
    expiresAt: string;
  } | null;
}

/** Managed list of institution types (Settings → Institution types). */
export interface MockInstitutionType {
  id: string;
  label: string;
  active: boolean;
}
export const initialInstitutionTypes: MockInstitutionType[] = [
  { id: 'ministry-department', label: 'Ministry department', active: true },
  { id: 'state-agency', label: 'State agency', active: true },
  { id: 'state-corporation', label: 'State corporation', active: true },
  { id: 'county-department', label: 'County department', active: true },
  { id: 'fund', label: 'Fund', active: true },
  { id: 'regulator', label: 'Regulator', active: true },
  {
    id: 'constitutional-commission',
    label: 'Constitutional commission',
    active: true,
  },
  { id: 'public-university', label: 'Public university', active: true },
];
const typeId = (label: string) =>
  initialInstitutionTypes.find((type) => type.label === label)!.id;

export const institutions: InstitutionRecord[] = [
  {
    id: 'DEMO-001',
    name: 'Demo Appointments Service Agency',
    typeId: typeId('State agency'),
    type: 'State agency',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-001',
      designation: 'Chief Executive Officer',
      email: 'ao.demo-001@example.invalid',
      phone: '',
    },
  },
  {
    id: 'DEMO-002',
    name: 'Demo Water Services Board',
    typeId: typeId('State corporation'),
    type: 'State corporation',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-002',
      designation: 'Managing Director',
      email: 'ao.demo-002@example.invalid',
      phone: '',
    },
  },
  {
    id: 'DEMO-003',
    name: 'Demo County Licensing Office',
    typeId: typeId('County department'),
    type: 'County department',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-003',
      designation: 'County Chief Officer',
      email: 'ao.demo-003@example.invalid',
      phone: '',
    },
  },
  {
    id: 'DEMO-004',
    name: 'Demo Revenue Collection Agency',
    typeId: typeId('State agency'),
    type: 'State agency',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-004',
      designation: 'Commissioner General',
      email: 'ao.demo-004@example.invalid',
      phone: '',
    },
  },
  {
    id: 'DEMO-005',
    name: 'Demo Referral Hospital Board',
    typeId: typeId('State corporation'),
    type: 'State corporation',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-005',
      designation: 'Chief Executive Officer',
      email: 'ao.demo-005@example.invalid',
      phone: '',
    },
  },
  {
    id: 'DEMO-006',
    name: 'Demo Roads Development Authority',
    typeId: typeId('State corporation'),
    type: 'State corporation',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-006',
      designation: 'Director General',
      email: 'ao.demo-006@example.invalid',
      phone: '',
    },
  },
  {
    id: 'DEMO-007',
    name: 'Demo Education Bursary Fund',
    typeId: typeId('Fund'),
    type: 'Fund',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-007',
      designation: 'Chief Executive Officer',
      email: 'ao.demo-007@example.invalid',
      phone: '',
    },
  },
  {
    id: 'DEMO-008',
    name: 'Demo Land Records Office',
    typeId: typeId('Ministry department'),
    type: 'Ministry department',
    active: true,
    accountingOfficer: {
      name: 'Accounting Officer, DEMO-008',
      designation: 'Principal Secretary',
      email: 'ao.demo-008@example.invalid',
      phone: '',
    },
  },
];

const focalPersons: MockUser[] = institutions.map((institution) => ({
  id: `focal-${institution.id.toLowerCase()}`,
  displayName: `Focal person, ${institution.id}`,
  email: `focal.${institution.id.toLowerCase()}@example.invalid`,
  role: 'institution',
  institutionId: institution.id,
  active: true,
  passwordHash: 'demo-password',
  jobTitle: 'Integrity Assurance Officer',
}));

export const users: MockUser[] = [
  ...focalPersons,
  {
    id: 'officer-a',
    jobTitle: 'Prevention Officer',
    displayName: 'Prevention Officer A',
    email: 'officer.a@example.invalid',
    role: 'officer',
    active: true,
    passwordHash: 'demo-password',
  },
  {
    id: 'officer-b',
    jobTitle: 'Prevention Officer',
    displayName: 'Prevention Officer B',
    email: 'officer.b@example.invalid',
    role: 'officer',
    active: true,
    passwordHash: 'demo-password',
  },
  {
    id: 'supervisor',
    jobTitle: 'Head of Prevention (fictional)',
    displayName: 'Supervisor',
    email: 'supervisor@example.invalid',
    role: 'supervisor',
    active: true,
    passwordHash: 'demo-password',
  },
  {
    id: 'administrator',
    jobTitle: 'System administrator',
    displayName: 'Administrator',
    email: 'administrator@example.invalid',
    role: 'administrator',
    active: true,
    passwordHash: 'demo-password',
  },
];

/** The one supervisor oversees all eight institutions (PRD §4.1 scenario). */
export const initialSupervisions = institutions.map((institution) => ({
  institutionId: institution.id,
  supervisorId: 'supervisor',
  validFrom: '2026-07-01T00:00:00+03:00',
  validTo: null as string | null,
  reason: null as string | null,
}));

/** Officer A owns DEMO-001–004 and Officer B owns DEMO-005–008 (PRD §17.1). */
export const initialAssignments = institutions.map((institution, index) => ({
  institutionId: institution.id,
  officerId: index < 4 ? 'officer-a' : 'officer-b',
  validFrom: '2026-07-01T00:00:00+03:00',
  validTo: null as string | null,
  reason: null as string | null,
  /** Temporary cover: returns to `returnToOfficerId` at `until`. */
  cover: null as {
    until: string;
    returnToOfficerId: string;
    setById: string;
  } | null,
  handoverNote: null as string | null,
}));
