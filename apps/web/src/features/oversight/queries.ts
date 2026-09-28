import { oversightSchema } from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { request } from '@/lib/api';

export interface OversightSearch {
  periodId?: string;
  institutionId?: string;
  officerId?: string;
}

/** Every filter is part of the query key and the URL, so shared links reproduce the view. */
export const oversightQuery = (filters: OversightSearch) =>
  queryOptions({
    queryKey: ['oversight', filters] as const,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams(
        Object.entries(filters).filter((entry): entry is [string, string] =>
          Boolean(entry[1]),
        ),
      );
      const query = params.toString();
      return request(
        query ? `/api/oversight?${query}` : '/api/oversight',
        oversightSchema,
        { signal },
      );
    },
  });
