import { http, HttpResponse } from 'msw';
import { formDraftUpdateSchema, type FormVersion } from '@cpi/contracts';
import { commit, getDb } from '../db';
import { validateForm, periodLocked } from '../services/forms';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { requireRole, requireUser } from '../services/session';
import { audit, notify, usersWithRole } from '../services/events';
import { activeWeights } from '../services/profiles';

function issuesAsFieldErrors(issues: { path: string; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) fieldErrors[issue.path] ??= issue.message;
  return fieldErrors;
}

export const formHandlers = [
  http.get('/api/forms', async () => {
    await networkDelay();
    const user = requireUser();
    const forms = getDb().forms.filter(
      (form) => user.role === 'administrator' || form.status === 'published',
    );
    return HttpResponse.json([...forms].sort((a, b) => b.version - a.version));
  }),
  http.get('/api/forms/:formId', async ({ params }) => {
    await networkDelay();
    const user = requireUser();
    const form = getDb().forms.find(
      (candidate) => candidate.id === params.formId,
    );
    if (!form || (form.status === 'draft' && user.role !== 'administrator'))
      return notFound();
    return HttpResponse.json(form);
  }),
  http.get('/api/forms/:formId/validation', async ({ params }) => {
    await networkDelay();
    requireRole('administrator');
    const form = getDb().forms.find(
      (candidate) => candidate.id === params.formId,
    );
    if (!form) return notFound();
    const issues = validateForm(form);
    return HttpResponse.json({ valid: issues.length === 0, issues });
  }),
  http.put('/api/forms/:formId', async ({ params, request }) => {
    await networkDelay();
    requireRole('administrator');
    const form = getDb().forms.find(
      (candidate) => candidate.id === params.formId,
    );
    if (!form) return notFound();
    if (form.status !== 'draft')
      return apiError(
        409,
        'Published versions cannot be edited. Create a new version instead.',
        'version_locked',
      );
    const parsed = formDraftUpdateSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success) {
      return apiError(
        422,
        'Check the highlighted fields.',
        'invalid_form',
        issuesAsFieldErrors(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
    }
    commit((db) => {
      Object.assign(form, parsed.data, {
        // A snapshot of the cycle profile's weights; they are set in Settings, not here.
        weights: activeWeights(db),
        updatedAt: db.businessTime,
      });
    });
    return HttpResponse.json(form);
  }),
  http.post('/api/forms/:formId/publish', async ({ params }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const form = getDb().forms.find(
      (candidate) => candidate.id === params.formId,
    );
    if (!form) return notFound();
    if (form.status !== 'draft')
      return apiError(
        409,
        'This version is already published.',
        'already_published',
      );
    const issues = validateForm(form);
    if (issues.length)
      return apiError(
        422,
        'Publication is blocked. Fix the listed issues and try again.',
        'publication_blocked',
        issuesAsFieldErrors(issues),
      );
    commit((db) => {
      form.status = 'published';
      form.publishedAt = db.businessTime;
      form.weights = activeWeights(db);
      // The scoring profile is locked for the cycle from the first publication (PRD §7.1).
      for (const candidate of db.forms) candidate.weightsLocked = true;
      // Future-period assignments move to the new version; started periods keep theirs.
      for (const other of db.forms) {
        if (other !== form && other.status === 'published')
          other.periodIds = other.periodIds.filter(
            (id) => !form.periodIds.includes(id),
          );
      }
      audit(
        db,
        user,
        'form.publish',
        { type: 'form', id: form.id, version: form.version },
        `Version ${form.version} for ${form.periodIds.length} period(s)`,
      );
      notify(
        db,
        `${form.id}:published`,
        'form.published',
        [...usersWithRole('institution'), ...usersWithRole('officer')],
        {
          title: `Reporting form version ${form.version} published`,
          body: 'The quarterly progress report form is available for the assigned periods.',
          link: (recipient) =>
            recipient.role === 'institution' ? '/institution' : '/officer',
        },
      );
    });
    return HttpResponse.json(form);
  }),
  http.post('/api/forms', async () => {
    await networkDelay();
    requireRole('administrator');
    const db = getDb();
    if (db.forms.some((form) => form.status === 'draft'))
      return apiError(
        409,
        'Finish or discard the existing draft version first.',
        'draft_exists',
      );
    const latest = [...db.forms].sort((a, b) => b.version - a.version)[0];
    if (!latest) return notFound();
    const draft: FormVersion = {
      ...structuredClone(latest),
      id: `form-v${latest.version + 1}`,
      version: latest.version + 1,
      status: 'draft',
      publishedAt: null,
      basedOnVersion: latest.version,
      periodIds: latest.periodIds.filter((periodId) => !periodLocked(periodId)),
      updatedAt: db.businessTime,
    };
    commit((store) => store.forms.push(draft));
    return HttpResponse.json(draft, { status: 201 });
  }),
];
