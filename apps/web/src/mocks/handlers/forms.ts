import { http, HttpResponse } from 'msw';
import {
  formDiscardSchema,
  formDraftUpdateSchema,
  type FormVersion,
} from '@cpi/contracts';
import { commit, getDb, type MockDb } from '../db';
import { diffForms, summarizeChanges } from '../services/form-changes';
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

const periodLabel = (db: MockDb) => (periodId: string) =>
  db.cycle.periods.find((period) => period.id === periodId)?.label ?? periodId;

/** Recomputes a draft's differences from the version it was based on. */
function refreshChanges(db: MockDb, form: FormVersion) {
  const base = db.forms.find(
    (candidate) => candidate.version === form.basedOnVersion,
  );
  form.changes = diffForms(base, form, periodLabel(db));
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
    const user = requireRole('administrator');
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
    // Two administrators, or two tabs, cannot silently overwrite each other's edits.
    if (parsed.data.baseRevision !== form.revision)
      return apiError(
        409,
        'Someone saved this draft after you opened it. Reload to see their changes, then make yours again.',
        'version_conflict',
      );
    const { title, periodIds, sections } = parsed.data;
    commit((db) => {
      Object.assign(
        form,
        { title, periodIds, sections },
        {
          // A snapshot of the cycle profile's weights; they are set in Settings, not here.
          weights: activeWeights(db),
          updatedAt: db.businessTime,
          revision: form.revision + 1,
        },
      );
      refreshChanges(db, form);
      audit(
        db,
        user,
        'form.draft_save',
        { type: 'form', id: form.id, version: form.version },
        `Draft version ${form.version} saved: ${summarizeChanges(form.changes)}`,
      );
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
    const quarters = form.periodIds.map(periodLabel(getDb())).join(', ');
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
      refreshChanges(db, form);
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
        `Version ${form.version} for ${quarters}. ${form.basedOnVersion ? summarizeChanges(form.changes) : 'First version'}`,
      );
      notify(
        db,
        `${form.id}:published`,
        'form.published',
        [
          ...usersWithRole('institution'),
          ...usersWithRole('officer'),
          ...usersWithRole('supervisor'),
        ],
        {
          title: `Reporting form version ${form.version} published`,
          body: form.basedOnVersion
            ? `${quarters} will use version ${form.version}. Changes from version ${form.basedOnVersion}: ${summarizeChanges(form.changes)}.`
            : `The quarterly progress report form is available for ${quarters}.`,
          link: (recipient) =>
            recipient.role === 'institution'
              ? '/institution'
              : recipient.role === 'supervisor'
                ? '/supervisor/rules'
                : '/officer/rules',
        },
      );
    });
    return HttpResponse.json(form);
  }),
  http.post('/api/forms', async () => {
    await networkDelay();
    const user = requireRole('administrator');
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
      revision: 0,
      changes: [],
    };
    commit((store) => {
      store.forms.push(draft);
      refreshChanges(store, draft);
      audit(
        store,
        user,
        'form.draft_create',
        { type: 'form', id: draft.id, version: draft.version },
        `Draft version ${draft.version} started from version ${latest.version}`,
      );
    });
    return HttpResponse.json(draft, { status: 201 });
  }),

  /** An unpublished draft can be discarded with a reason; the first version cannot. */
  http.delete('/api/forms/:formId', async ({ params, request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const db = getDb();
    const form = db.forms.find((candidate) => candidate.id === params.formId);
    if (!form) return notFound();
    if (form.status !== 'draft')
      return apiError(
        409,
        'Published versions are kept for the record and cannot be discarded.',
        'version_locked',
      );
    if (!db.forms.some((candidate) => candidate.status === 'published'))
      return apiError(
        409,
        'The first version cannot be discarded. Edit it and publish it instead.',
        'first_version',
      );
    const parsed = formDiscardSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Give a reason of at least 10 characters.',
        'reason_required',
        { reason: 'Give a reason of at least 10 characters.' },
      );
    commit((store) => {
      store.forms = store.forms.filter((candidate) => candidate !== form);
      audit(
        store,
        user,
        'form.discard',
        { type: 'form', id: form.id, version: form.version },
        `Draft version ${form.version} discarded: ${parsed.data.reason}`,
      );
    });
    return new HttpResponse(null, { status: 204 });
  }),
];
