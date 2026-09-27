import {
  calendarSettingsSchema,
  peopleSchema,
  profilesStateSchema,
  scoringProfileSchema,
  simulationStateSchema,
  type CalendarUpdate,
  type InstitutionUpdate,
  type ProfileUpdate,
  type UserCreate,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { request } from '@/lib/api';

export const settingsKeys = {
  profiles: ['settings', 'profiles'] as const,
  calendar: ['settings', 'calendar'] as const,
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
) =>
  request(
    `/api/settings/users/${encodeURIComponent(userId)}/status`,
    peopleSchema,
    { method: 'POST', json: { active, reason } },
  );
export const updateInstitution = (id: string, update: InstitutionUpdate) =>
  request(
    `/api/settings/institutions/${encodeURIComponent(id)}`,
    peopleSchema,
    { method: 'PUT', json: update },
  );
