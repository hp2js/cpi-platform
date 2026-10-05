import {
  adminAttentionSchema,
  calendarSettingsSchema,
  peopleSchema,
  riskScaleSettingsSchema,
  type RiskScaleUpdate,
  profilesStateSchema,
  scoringProfileSchema,
  simulationStateSchema,
  institutionImportPreviewSchema,
  institutionImportResultSchema,
  type CalendarUpdate,
  type InstitutionCreate,
  type InstitutionUpdate,
  type ProfileUpdate,
  type UserCreate,
  type UserUpdate,
  type InstitutionTypeUpdate,
  accountSchema,
  type AccountUpdate,
  type UserRoleChange,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const settingsKeys = {
  profiles: ['settings', 'profiles'] as const,
  calendar: ['settings', 'calendar'] as const,
  riskScale: ['settings', 'risk-scale'] as const,
  people: ['settings', 'people'] as const,
};

export const profilesQuery = queryOptions({
  queryKey: settingsKeys.profiles,
  queryFn: ({ signal }) =>
    request('/api/settings/profiles', profilesStateSchema, { signal }),
});
export const calendarQuery = queryOptions({
  queryKey: settingsKeys.calendar,
  queryFn: ({ signal }) =>
    request('/api/settings/calendar', calendarSettingsSchema, { signal }),
});
export const peopleQuery = queryOptions({
  queryKey: settingsKeys.people,
  queryFn: ({ signal }) =>
    request('/api/settings/people', peopleSchema, { signal }),
});

const profilePath = (id: string) =>
  `/api/settings/profiles/${encodeURIComponent(id)}` as const;

export const copyProfile = (basedOn: string) =>
  request('/api/settings/profiles', scoringProfileSchema, {
    method: 'POST',
    json: { basedOn },
  });
export const saveProfile = (id: string, update: ProfileUpdate) =>
  request(profilePath(id), scoringProfileSchema, {
    method: 'PUT',
    json: update,
  });
export const deleteProfile = (id: string) =>
  request(profilePath(id), profilesStateSchema, { method: 'DELETE' });
export const approveProfile = (id: string) =>
  request(`${profilePath(id)}/approve`, scoringProfileSchema, {
    method: 'POST',
  });
export const applyProfile = (id: string) =>
  request(`${profilePath(id)}/apply`, profilesStateSchema, { method: 'POST' });
/** Starts a new simulation run that uses the given profile (PRD §7.1). */
export const startRunWithProfile = (profileId: string) =>
  request('/api/simulation/reset', simulationStateSchema, {
    method: 'POST',
    json: { profileId },
  });

export const riskScaleQuery = queryOptions({
  queryKey: settingsKeys.riskScale,
  queryFn: ({ signal }) =>
    request('/api/settings/risk-scale', riskScaleSettingsSchema, { signal }),
});
export const saveRiskScale = (update: RiskScaleUpdate) =>
  request('/api/settings/risk-scale', riskScaleSettingsSchema, {
    method: 'PUT',
    json: update,
  });

export const saveCalendar = (update: CalendarUpdate) =>
  request('/api/settings/calendar', calendarSettingsSchema, {
    method: 'PUT',
    json: update,
  });

export const createUser = (user: UserCreate) =>
  request('/api/settings/users', peopleSchema, { method: 'POST', json: user });
export const setUserActive = (
  userId: string,
  active: boolean,
  reason: string,
  confirmNoFocalPerson = false,
) =>
  request(
    `/api/settings/users/${encodeURIComponent(userId)}/status`,
    peopleSchema,
    { method: 'POST', json: { active, reason, confirmNoFocalPerson } },
  );
/** Emails a fresh temporary password; the earlier one stops working. */
export const resendInvitation = (userId: string) =>
  request(
    `/api/settings/users/${encodeURIComponent(userId)}/invitation`,
    peopleSchema,
    { method: 'POST' },
  );
export const updateInstitution = (id: string, update: InstitutionUpdate) =>
  request(
    `/api/settings/institutions/${encodeURIComponent(id)}`,
    peopleSchema,
    { method: 'PUT', json: update },
  );

export const createInstitution = (institution: InstitutionCreate) =>
  request('/api/settings/institutions', peopleSchema, {
    method: 'POST',
    json: institution,
  });
export const previewInstitutionImport = (
  csv: string,
  seedOpenedQuarters: boolean,
) =>
  request(
    '/api/settings/institutions/import/preview',
    institutionImportPreviewSchema,
    { method: 'POST', json: { csv, seedOpenedQuarters } },
  );
export const importInstitutions = (csv: string, seedOpenedQuarters: boolean) =>
  request('/api/settings/institutions/import', institutionImportResultSchema, {
    method: 'POST',
    json: { csv, seedOpenedQuarters },
    timeoutMs: 30_000,
  });

export const updateUser = (userId: string, update: UserUpdate) =>
  request(`/api/settings/users/${encodeURIComponent(userId)}`, peopleSchema, {
    method: 'PUT',
    json: update,
  });
export const saveInstitutionType = (
  update: InstitutionTypeUpdate,
  typeId?: string,
) =>
  request(
    `/api/settings/institution-types${typeId ? `/${encodeURIComponent(typeId)}` : ''}`,
    peopleSchema,
    { method: typeId ? 'PUT' : 'POST', json: update },
  );

export const accountQuery = queryOptions({
  queryKey: ['account'],
  queryFn: ({ signal }) => request('/api/account', accountSchema, { signal }),
});
export const saveAccount = (update: AccountUpdate) =>
  request('/api/account', accountSchema, { method: 'PUT', json: update });

export const adminAttentionQuery = queryOptions({
  queryKey: ['admin', 'attention'] as const,
  queryFn: ({ signal }) =>
    request('/api/admin/attention', adminAttentionSchema, { signal }),
});

/** Keeps one identity and its history; scope must be handed over first. */
export const changeUserRole = (userId: string, change: UserRoleChange) =>
  request(
    `/api/settings/users/${encodeURIComponent(userId)}/role`,
    z.object({ ok: z.boolean() }),
    { method: 'PUT', json: change },
  );
