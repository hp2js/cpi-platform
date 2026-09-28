import { http, HttpResponse } from 'msw';
import {
  accountingOfficerSchema,
  type Assignment,
  type InstitutionProfile,
} from '@cpi/contracts';
import { commit, getDb } from '../db';
import { accountStatus } from '../services/auth';
import { assignedOfficers, audit, notify } from '../services/events';
import { apiError, forbidden, notFound } from '../services/http';
import { toInstitution } from '../services/institutions';
import { networkDelay } from '../services/latency';
import { toAssignment } from '../services/assignments';
import { toObligation } from '../services/obligations';
import { canReadInstitution, readableInstitutionIds } from '../services/scope';
import { requireRole, requireUser } from '../services/session';

export const directoryHandlers = [
  http.get('/api/cycles/current', async () => {
    await networkDelay();
    requireUser();
    return HttpResponse.json(getDb().cycle);
  }),
  http.get('/api/institutions', async () => {
    await networkDelay();
    const readable = readableInstitutionIds(requireUser());
    const db = getDb();
    return HttpResponse.json(
      db.institutions
        .filter((institution) => readable.includes(institution.id))
        .map((institution) => toInstitution(db, institution)),
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
    return HttpResponse.json(toInstitution(getDb(), institution));
  }),
  /** A focal person's own institution: its record, reviewing officer and focal persons. */
  http.get('/api/institution-profile', async () => {
    await networkDelay();
    const user = requireRole('institution');
    const db = getDb();
    const institution = db.institutions.find(
      (candidate) => candidate.id === user.institutionId,
    );
    if (!institution) return notFound();
    const officerId = db.assignments.find(
      (assignment) =>
        assignment.institutionId === institution.id &&
        assignment.validTo === null,
    )?.officerId;
    const profile: InstitutionProfile = {
      institution: toInstitution(db, institution),
      reviewingOfficer:
        db.users.find((candidate) => candidate.id === officerId)?.displayName ??
        null,
      focalPersons: db.users
        .filter(
          (candidate) =>
            candidate.role === 'institution' &&
            candidate.institutionId === institution.id,
        )
        .map((candidate) => ({
          id: candidate.id,
          displayName: candidate.displayName,
          jobTitle: candidate.jobTitle ?? '',
          email: candidate.email,
          status: accountStatus(candidate),
        })),
    };
    return HttpResponse.json(profile);
  }),

  /**
   * The institution knows first when its Accounting Officer changes, so its focal persons keep
   * the contact current. Name, type and ID stay with the administrator. Audited; the officer
   * is told.
   */
  http.put(
    '/api/institution-profile/accounting-officer',
    async ({ request }) => {
      await networkDelay();
      const user = requireRole('institution');
      const parsed = accountingOfficerSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues)
          fieldErrors[String(issue.path[0])] ??= issue.message;
        return apiError(
          422,
          'Check the Accounting Officer’s details.',
          'invalid_request',
          fieldErrors,
        );
      }
      const db = getDb();
      const institution = db.institutions.find(
        (candidate) => candidate.id === user.institutionId,
      );
      if (!institution) return notFound();
      const next = {
        ...parsed.data,
        email: parsed.data.email.toLowerCase(),
      };
      commit((store) => {
        const target = store.institutions.find(
          (candidate) => candidate.id === institution.id,
        )!;
        const before = target.accountingOfficer?.name;
        target.accountingOfficer = next;
        audit(
          store,
          user,
          'institution.accounting_officer',
          { type: 'institution', id: institution.id },
          before && before !== next.name
            ? `Accounting Officer changed from ${before} to ${next.name}`
            : `Accounting Officer contact updated (${next.name})`,
        );
        notify(
          store,
          `${institution.id}:ao:${store.sequence}`,
          'institution.updated',
          assignedOfficers(institution.id),
          {
            title: `${institution.id} updated its Accounting Officer contact`,
            body: `${next.name}, ${next.designation}. Updated by ${user.displayName}.`,
            link: `/officer/institutions/${institution.id}`,
          },
        );
      });
      return HttpResponse.json({ ok: true });
    },
  ),

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
    const { assignments } = getDb();
    const readable = readableInstitutionIds(user);
    const visible = assignments.filter(
      (assignment) =>
        (user.role !== 'officer' || assignment.officerId === user.id) &&
        readable.includes(assignment.institutionId),
    );
    const db = getDb();
    return HttpResponse.json(
      visible.map((assignment): Assignment => toAssignment(db, assignment)),
    );
  }),
];
