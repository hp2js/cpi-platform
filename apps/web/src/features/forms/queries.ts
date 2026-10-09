import {
  formCheckSchema,
  formCreationSchema,
  formValidationSchema,
  formVersionSchema,
  formVersionsSchema,
  type FormCheckRequest,
  type FormDraftUpdate,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const formKeys = {
  all: ['forms'] as const,
  detail: (id: string) => ['forms', id] as const,
  validation: (id: string) => ['forms', id, 'validation'] as const,
  check: (id: string, draft: FormCheckRequest) =>
    ['forms', id, 'check', draft] as const,
  creation: ['forms', 'creation'] as const,
};

/** Whether a new version can be started now, and why not (FR03). */
export const formCreationQuery = queryOptions({
  queryKey: formKeys.creation,
  queryFn: ({ signal }) =>
    request('/api/forms/creation', formCreationSchema, { signal }),
});

/**
 * Publication checks, changes and impact for the draft as edited, before it is saved. The
 * server decides; the editor only shows what it returns.
 */
export const formCheckQuery = (id: string, draft: FormCheckRequest) =>
  queryOptions({
    queryKey: formKeys.check(id, draft),
    queryFn: ({ signal }) =>
      request(`/api/forms/${encodeURIComponent(id)}/check`, formCheckSchema, {
        method: 'POST',
        json: draft,
        signal,
      }),
    placeholderData: (previous) => previous,
  });

export const formsQuery = queryOptions({
  queryKey: formKeys.all,
  queryFn: ({ signal }) =>
    request('/api/forms', formVersionsSchema, { signal }),
});

export const formQuery = (id: string) =>
  queryOptions({
    queryKey: formKeys.detail(id),
    queryFn: ({ signal }) =>
      request(`/api/forms/${encodeURIComponent(id)}`, formVersionSchema, {
        signal,
      }),
  });

export const formValidationQuery = (id: string) =>
  queryOptions({
    queryKey: formKeys.validation(id),
    queryFn: ({ signal }) =>
      request(
        `/api/forms/${encodeURIComponent(id)}/validation`,
        formValidationSchema,
        { signal },
      ),
  });

export const saveForm = (id: string, update: FormDraftUpdate) =>
  request(`/api/forms/${encodeURIComponent(id)}`, formVersionSchema, {
    method: 'PUT',
    json: update,
  });

export const publishForm = (id: string) =>
  request(`/api/forms/${encodeURIComponent(id)}/publish`, formVersionSchema, {
    method: 'POST',
  });

export const discardForm = (id: string, reason: string) =>
  request(`/api/forms/${encodeURIComponent(id)}`, z.unknown(), {
    method: 'DELETE',
    json: { reason },
  });

export const createFormVersion = () =>
  request('/api/forms', formVersionSchema, { method: 'POST' });

/** Form changes affect every screen that renders a report, so refresh them together. */
export async function invalidateForms(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: formKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['reports'] }),
  ]);
}
