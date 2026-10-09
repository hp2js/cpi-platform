import {
  reportIdentitySchema,
  reportIdentitySettingsSchema,
  type ReportIdentityUpdate,
  type ReportImageSlot,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { request } from '@/lib/api';

export const identityKeys = {
  current: ['report-identity'] as const,
  settings: ['report-identity', 'settings'] as const,
};

/** The identity in force, for screens that render a report outside a publication. */
export const reportIdentityQuery = queryOptions({
  queryKey: identityKeys.current,
  queryFn: ({ signal }) =>
    request('/api/report-identity', reportIdentitySchema, { signal }),
});

export const reportIdentitySettingsQuery = queryOptions({
  queryKey: identityKeys.settings,
  queryFn: ({ signal }) =>
    request('/api/settings/report-identity', reportIdentitySettingsSchema, {
      signal,
    }),
});

export const saveReportIdentity = (update: ReportIdentityUpdate) =>
  request('/api/settings/report-identity', reportIdentitySettingsSchema, {
    method: 'PUT',
    json: update,
  });

export const uploadReportImage = (slot: ReportImageSlot, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return request(
    `/api/settings/report-identity/images/${slot}`,
    reportIdentitySettingsSchema,
    { method: 'POST', body },
  );
};

export const removeReportImage = (slot: ReportImageSlot) =>
  request(
    `/api/settings/report-identity/images/${slot}`,
    reportIdentitySettingsSchema,
    { method: 'DELETE' },
  );

/** Where an image is served; readable by every signed-in role that sees the report. */
export const reportImageUrl = (id: string) =>
  `/api/report-identity/images/${encodeURIComponent(id)}`;
