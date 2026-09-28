import { useSuspenseQuery } from '@tanstack/react-query';
import { sessionQuery } from './queries';

/** Current session inside guarded routes; the route guard has already loaded it. */
export function useSession() {
  return useSuspenseQuery(sessionQuery).data;
}
