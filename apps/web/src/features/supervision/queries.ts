import {
  reassignmentSuggestionSchema,
  reassignmentSuggestionsSchema,
  supervisionsSchema,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const supervisionKeys = {
  records: ['supervision'] as const,
  suggestions: ['assignment-suggestions'] as const,
};

/** Supervisor records in the caller's scope, current and past. */
export const supervisionQuery = queryOptions({
  queryKey: supervisionKeys.records,
  queryFn: ({ signal }) =>
    request('/api/supervision', supervisionsSchema, { signal }),
});

export const suggestionsQuery = queryOptions({
  queryKey: supervisionKeys.suggestions,
  queryFn: ({ signal }) =>
    request('/api/assignment-suggestions', reassignmentSuggestionsSchema, {
      signal,
    }),
});

export const changeSupervisor = (
  institutionId: string,
  supervisorId: string,
  reason: string,
) =>
  request('/api/supervision', z.object({ ok: z.boolean() }), {
    method: 'POST',
    json: { institutionId, supervisorId, reason },
  });

export const suggestReassignment = (input: {
  kind?: 'suggestion' | 'conflict_of_interest';
  institutionId: string;
  suggestedOfficerId: string | null;
  reason: string;
}) =>
  request('/api/assignment-suggestions', reassignmentSuggestionSchema, {
    method: 'POST',
    json: input,
  });

export const dismissSuggestion = (suggestionId: string, note: string) =>
  request(
    `/api/assignment-suggestions/${encodeURIComponent(suggestionId)}/dismiss`,
    reassignmentSuggestionSchema,
    { method: 'POST', json: { note } },
  );
