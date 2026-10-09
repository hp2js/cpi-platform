import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type {
  Draft,
  EvidenceItem,
  FormVersion,
  ReportBundle,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import { publishedFormForPeriod } from '../cycle/rules';
import type { Db } from '../database/db';
import {
  baselines,
  closures,
  drafts,
  evidence,
  formVersions,
  obligations,
  periods,
  publications,
  receipts,
  submissions,
} from '../database/schema';
import { toObligations } from '../directory/obligations';
import { notFound } from '../http/api-error';
import { clarificationsFor } from '../review/clarifications';
import { isEditableState } from './rules';

export type ObligationRow = typeof obligations.$inferSelect;
type EvidenceRow = typeof evidence.$inferSelect;

/** The public shape of a stored evidence record, without its internal scope keys. */
export function toEvidenceItem(item: EvidenceRow): EvidenceItem {
  return {
    id: item.id,
    category: item.category as EvidenceItem['category'],
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256,
    uploadedAt: item.uploadedAt,
    uploadedBy: item.uploadedBy,
    version: item.version,
    predecessorId: item.predecessorId,
    supersededBy: item.supersededBy,
  };
}

export async function obligationById(db: Db, id: string) {
  const [obligation] = await db
    .select()
    .from(obligations)
    .where(eq(obligations.id, id));
  return obligation;
}

/** Drafts are private to the institution (PRD §5.2), so only its own users reach them. */
export async function ownObligation(db: Db, user: User, id: string) {
  const obligation = await obligationById(db, id);
  if (!obligation || obligation.institutionId !== user.institutionId)
    throw notFound();
  return obligation;
}

/** The latest baseline version for a period; earlier versions stay in history. */
export async function latestBaseline(
  db: Db,
  institutionId: string,
  periodId: string,
) {
  const [baseline] = await db
    .select()
    .from(baselines)
    .where(
      and(
        eq(baselines.institutionId, institutionId),
        eq(baselines.periodId, periodId),
      ),
    )
    .orderBy(desc(baselines.version))
    .limit(1);
  return baseline;
}

/** A draft keeps the version it started on; otherwise the period's current published version. */
async function formFor(
  db: Db,
  obligation: ObligationRow,
  draftFormId: string | undefined,
): Promise<FormVersion | undefined> {
  const [latest] = draftFormId
    ? []
    : await db
        .select({ formVersionId: submissions.formVersionId })
        .from(submissions)
        .where(eq(submissions.obligationId, obligation.id))
        .orderBy(desc(submissions.revision))
        .limit(1);
  const pinned = draftFormId ?? latest?.formVersionId;
  const forms = await db.select().from(formVersions);
  return pinned
    ? forms.find((form) => form.id === pinned)
    : publishedFormForPeriod(forms, obligation.periodId);
}

/** Everything the institution report screens need for one obligation. */
export async function loadReport(db: Db, obligation: ObligationRow) {
  const [draftRow] = await db
    .select()
    .from(drafts)
    .where(eq(drafts.obligationId, obligation.id));
  const [
    [view],
    [period],
    form,
    baseline,
    clarifications,
    items,
    issued,
    [latest],
    [closure],
    [publication],
  ] = await Promise.all([
    toObligations(db, [obligation], 'institution'),
    db.select().from(periods).where(eq(periods.id, obligation.periodId)),
    formFor(db, obligation, draftRow?.formVersionId),
    latestBaseline(db, obligation.institutionId, obligation.periodId),
    clarificationsFor(db, obligation.id),
    db
      .select()
      .from(evidence)
      .where(eq(evidence.obligationId, obligation.id))
      .orderBy(asc(evidence.seq)),
    db
      .select({ receipt: receipts.receipt })
      .from(receipts)
      .where(eq(receipts.obligationId, obligation.id))
      .orderBy(asc(receipts.seq)),
    db
      .select({
        revision: submissions.revision,
        answers: submissions.answers,
      })
      .from(submissions)
      .where(eq(submissions.obligationId, obligation.id))
      .orderBy(desc(submissions.revision))
      .limit(1),
    db
      .select({ reason: closures.reason, by: closures.by, at: closures.at })
      .from(closures)
      .where(eq(closures.obligationId, obligation.id)),
    db
      .select({ id: publications.id })
      .from(publications)
      .where(
        and(
          eq(publications.institutionId, obligation.institutionId),
          isNull(publications.supersededBy),
        ),
      )
      .limit(1),
  ]);
  const draft: Draft | null = draftRow ?? null;
  const milestones = baseline?.milestones ?? [];
  const bundle: ReportBundle = {
    obligation: view!,
    period: {
      id: period!.id,
      quarter: period!.quarter,
      label: period!.label,
      startsOn: period!.startsOn,
      endsOn: period!.endsOn,
      submissionDeadline: period!.submissionDeadline,
    },
    form: form ?? null,
    baseline: {
      status: baseline?.status === 'approved' ? 'approved' : 'pending_approval',
      milestones,
    },
    clarifications,
    draft,
    evidence: items.map(toEvidenceItem),
    receipts: issued.map((row) => row.receipt),
    submitted: latest ?? null,
    editable:
      form !== undefined &&
      !view!.flags.includes('not_yet_due') &&
      isEditableState(obligation.state),
    closure: closure ?? null,
    resultPublished: Boolean(publication),
  };
  return {
    bundle,
    form,
    milestones,
    baseline,
    period: bundle.period,
    evidence: items,
  };
}
