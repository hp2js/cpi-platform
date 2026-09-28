import { http, HttpResponse } from 'msw';
import type { Assignment } from '@cpi/contracts';
import { getDb } from '../db';
import { forbidden, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { toObligation } from '../services/obligations';
import { canReadInstitution, readableInstitutionIds } from '../services/scope';
import { requireUser } from '../services/session';

export const directoryHandlers = [
  http.get('/api/cycles/current', async () => {
    await networkDelay();
    requireUser();
    return HttpResponse.json(getDb().cycle);
  }),
  http.get('/api/institutions', async () => {
    await networkDelay();
    const readable = readableInstitutionIds(requireUser());
    return HttpResponse.json(
      getDb().institutions.filter((institution) =>
        readable.includes(institution.id),
      ),
    );
  }),
  http.get('/api/institutions/:institutionId', async ({ params }) => {
    await networkDelay();
    const user = requireUser();
    const institution = getDb().institutions.find(
      (candidate) => candidate.id === params.institutionId,
    );
    if (!institution || !canReadInstitution(user, institution.id))
      return notFound();
    return HttpResponse.json(institution);
  }),
  http.get('/api/obligations', async ({ request }) => {
    await networkDelay();
    const user = requireUser();
    const filter = new URL(request.url).searchParams.get('institutionId');
    if (filter && !canReadInstitution(user, filter)) return notFound();
    const readable = readableInstitutionIds(user);
    return HttpResponse.json(
      getDb()
        .obligations.filter(
          (obligation) =>
            readable.includes(obligation.institutionId) &&
            (!filter || obligation.institutionId === filter),
        )
        .map((obligation) =>
          toObligation(
            obligation,
            user.role === 'institution' ? 'institution' : 'internal',
          ),
        ),
    );
  }),
  http.get('/api/assignments', async () => {
    await networkDelay();
    const user = requireUser();
    if (user.role === 'institution') return forbidden();
    const { assignments, users } = getDb();
    const readable = readableInstitutionIds(user);
    const visible = assignments.filter(
      (assignment) =>
        (user.role !== 'officer' || assignment.officerId === user.id) &&
        readable.includes(assignment.institutionId),
    );
    return HttpResponse.json(
      visible.map((assignment): Assignment => ({
        ...assignment,
        officerName:
          users.find((candidate) => candidate.id === assignment.officerId)
            ?.displayName ?? assignment.officerId,
      })),
    );
  }),
];
