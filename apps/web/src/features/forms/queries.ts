import {
  formValidationSchema,
  formVersionSchema,
  formVersionsSchema,
  type FormDraftUpdate,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { request } from '@/lib/api';

export const formKeys = {
  all: ['forms'] as const,
  detail: (id: string) => ['forms', id] as const,
  validation: (id: string) => ['forms', id, 'validation'] as const,
};

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

export const createFormVersion = () =>
  request('/api/forms', formVersionSchema, { method: 'POST' });

/** Form changes affect every screen that renders a report, so refresh them together. */
export async function invalidateForms(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: formKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['reports'] }),
  ]);
}
