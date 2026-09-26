import type { Institution, Role } from '@cpi/contracts';

/** Fictional cast from PRD §17.1. No record represents a real institution or person. */
export interface MockUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  institutionId?: string;
  active: boolean;
}

export const institutions: Institution[] = [
  {
    id: 'DEMO-001',
    name: 'Demo Appointments Service Agency',
    type: 'State agency',
    active: true,
  },
  {
    id: 'DEMO-002',
    name: 'Demo Water Services Board',
    type: 'State corporation',
    active: true,
  },
  {
    id: 'DEMO-003',
    name: 'Demo County Licensing Office',
    type: 'County department',
    active: true,
  },
  {
    id: 'DEMO-004',
    name: 'Demo Revenue Collection Agency',
    type: 'State agency',
    active: true,
  },
  {
    id: 'DEMO-005',
    name: 'Demo Referral Hospital Board',
    type: 'State corporation',
    active: true,
  },
  {
    id: 'DEMO-006',
    name: 'Demo Roads Development Authority',
    type: 'State corporation',
    active: true,
  },
  {
    id: 'DEMO-007',
    name: 'Demo Education Bursary Fund',
    type: 'Fund',
    active: true,
  },
  {
    id: 'DEMO-008',
    name: 'Demo Land Records Office',
    type: 'Ministry department',
    active: true,
  },
];

const focalPersons: MockUser[] = institutions.map((institution) => ({
  id: `focal-${institution.id.toLowerCase()}`,
  displayName: `Focal person, ${institution.id}`,
  email: `focal.${institution.id.toLowerCase()}@example.invalid`,
  role: 'institution',
  institutionId: institution.id,
  active: true,
}));

export const users: MockUser[] = [
  ...focalPersons,
  {
    id: 'officer-a',
    displayName: 'Prevention Officer A',
    email: 'officer.a@example.invalid',
    role: 'officer',
    active: true,
  },
  {
    id: 'officer-b',
    displayName: 'Prevention Officer B',
    email: 'officer.b@example.invalid',
    role: 'officer',
    active: true,
  },
  {
    id: 'supervisor',
    displayName: 'Supervisor',
    email: 'supervisor@example.invalid',
    role: 'supervisor',
    active: true,
  },
  {
    id: 'administrator',
    displayName: 'Administrator',
    email: 'administrator@example.invalid',
    role: 'administrator',
    active: true,
  },
];

/** Officer A owns DEMO-001–004 and Officer B owns DEMO-005–008 (PRD §17.1). */
export const initialAssignments = institutions.map((institution, index) => ({
  institutionId: institution.id,
  officerId: index < 4 ? 'officer-a' : 'officer-b',
  validFrom: '2026-07-01T00:00:00+03:00',
  validTo: null as string | null,
  reason: null as string | null,
}));
