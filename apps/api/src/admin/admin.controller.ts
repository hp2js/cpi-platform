import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { eq, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import {
  elevatedAuditActions,
  supportAccessRequestSchema,
  toCsv,
  type AdminAttention,
  type AuditEvent,
  type AuditPage,
  type ReportBundle,
} from '@cpi/contracts';
import { evaluate, loadAnnualData } from '../annual/data';
import { accountStatus, invitationExpiresAt } from '../auth/passwords';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write, type Db } from '../database/db';
import {
  assignments,
  auditEvents,
  deliveries,
  formVersions,
  institutions,
  obligations,
  publications,
  suggestions,
  supervisions,
  users,
} from '../database/schema';
import { currentState } from '../database/state';
import { Events, institutionUsers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { loadReport } from '../reporting/report';

type AuditFilters = Record<string, string | undefined>;

/**
 * Audit events matching the filters, newest first.
 * ponytail: filters in memory over the whole log; move to SQL WHERE/LIMIT when the log
 * reaches hundreds of thousands of rows.
 */
async function filteredAudit(db: Db, query: AuditFilters) {
  const { objectType, action, actor, from, to } = query;
  const elevated = query.elevated === 'true';
  const needle = query.q?.trim().toLowerCase();
  const rows = await db
    .select()
    .from(auditEvents)
    .orderBy(sql`${auditEvents.seq} DESC`);
  const all: AuditEvent[] = rows.map(({ seq, ...event }) => event);
  return {
    all,
    events: all.filter(
      (event) =>
        (!objectType || event.objectType === objectType) &&
        (!action || event.action === action) &&
        (!actor || event.actorName === actor) &&
        // Dates are local calendar dates against business time.
        (!from || event.businessTime.slice(0, 10) >= from) &&
        (!to || event.businessTime.slice(0, 10) <= to) &&
        (!elevated ||
          (elevatedAuditActions as readonly string[]).includes(event.action)) &&
        (!needle ||
          `${event.summary} ${event.objectId} ${event.actorName} ${event.action}`
            .toLowerCase()
            .includes(needle)),
    ),
  };
}

/** Administrator console: audit log, attention list and support access (FR10, PRD §5.2, §9). */
@Controller()
@Roles('administrator')
export class AdminController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  /** The audit log, filtered and paged on the server (FR10). */
  @Get('audit')
  async audit(@Query() query: AuditFilters): Promise<AuditPage> {
    const { all, events } = await filteredAudit(this.db, query);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));
    const pages = Math.max(1, Math.ceil(events.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(query.page) || 1));
    return {
      events: events.slice((page - 1) * pageSize, page * pageSize),
      total: events.length,
      page,
      pageSize,
      actions: [...new Set(all.map((event) => event.action))].sort(),
      actors: [...new Set(all.map((event) => event.actorName))].sort(),
    };
  }

  /** The same filters as a CSV file for auditors; cells are encoded against formula injection. */
  @Get('audit.csv')
  async auditCsv(@Query() query: AuditFilters, @Res() response: Response) {
    const { events } = await filteredAudit(this.db, query);
    response
      .type('text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        'attachment; filename="cpi-audit-log.csv"',
      )
      .send(
        toCsv(
          [
            'business_time',
            'actual_time',
            'actor',
            'actor_role',
            'action',
            'object_type',
            'object_id',
            'object_version',
            'summary',
          ],
          events.map((event) => [
            event.businessTime,
            event.actualTime,
            event.actorName,
            event.actorRole,
            event.action,
            event.objectType,
            event.objectId,
            event.objectVersion ?? '',
            event.summary,
          ]),
        ),
      );
  }

  /** What needs the administrator now, each with a link to where it is handled (PRD §9). */
  @Get('admin/attention')
  async attention(): Promise<AdminAttention> {
    const db = this.db;
    const [
      { state, cycle },
      deliveryRows,
      suggestionRows,
      institutionRows,
      userRows,
      assignmentRows,
      supervisionRows,
      published,
    ] = await Promise.all([
      currentState(db),
      db.select().from(deliveries).where(eq(deliveries.status, 'failed')),
      db.select().from(suggestions).where(eq(suggestions.status, 'open')),
      db.select().from(institutions).where(eq(institutions.active, true)),
      db.select().from(users),
      db.select().from(assignments).where(isNull(assignments.validTo)),
      db.select().from(supervisions).where(isNull(supervisions.validTo)),
      db
        .select({ id: formVersions.id })
        .from(formVersions)
        .where(eq(formVersions.status, 'published')),
    ]);
    const items: AdminAttention = [];
    const add = (
      id: string,
      count: number,
      title: string,
      detail: string,
      link: string,
    ) => {
      if (count > 0) items.push({ id, count, title, detail, link });
    };
    add(
      'deliveries',
      deliveryRows.length,
      'Emails failed after three attempts',
      'Retry them from the failure queue once the problem is fixed.',
      '/admin/notifications',
    );
    add(
      'requests',
      suggestionRows.length,
      'Reassignment requests waiting',
      'Supervisors’ suggestions and officers’ conflict-of-interest declarations.',
      '/admin/assignments',
    );
    add(
      'no-focal',
      institutionRows.filter(
        (institution) =>
          !userRows.some(
            (user) =>
              user.role === 'institution' &&
              user.institutionId === institution.id &&
              accountStatus(user) === 'active',
          ),
      ).length,
      'Institutions with no active focal person',
      'Nobody can report for them or receive their clarifications.',
      '/admin/institutions',
    );
    add(
      'no-supervisor',
      institutionRows.filter(
        (institution) =>
          !supervisionRows.some((row) => row.institutionId === institution.id),
      ).length,
      'Institutions without a supervisor',
      'No supervisor sees them. Assign one under Assignments.',
      '/admin/assignments',
    );
    add(
      'no-officer',
      institutionRows.filter(
        (institution) =>
          !assignmentRows.some((row) => row.institutionId === institution.id),
      ).length,
      'Institutions without a reviewing officer',
      'Nobody reviews their reports. Assign an officer under Assignments.',
      '/admin/assignments',
    );
    add(
      'idle-officers',
      userRows.filter(
        (user) =>
          user.role === 'officer' &&
          user.active &&
          !assignmentRows.some((row) => row.officerId === user.id),
      ).length,
      'Officers with no institutions',
      'Assign them institutions, or deactivate accounts no longer needed.',
      '/admin/assignments',
    );
    add(
      'expired-invitations',
      userRows.filter((user) => {
        const expires = invitationExpiresAt(user);
        return expires !== null && Date.parse(expires) < Date.now();
      }).length,
      'Invitations that expired unused',
      'Send a new invitation from the Users page.',
      '/admin/users',
    );
    add(
      'no-form',
      published.length ? 0 : 1,
      'No report form is published',
      'Institutions cannot report until a form version is published.',
      '/admin/forms',
    );
    if (Date.parse(state.businessTime) > Date.parse(cycle.evaluationCutoff)) {
      const ids = institutionRows.map((institution) => institution.id);
      const data = await loadAnnualData(db, ids);
      const current = await db
        .select({ institutionId: publications.institutionId })
        .from(publications)
        .where(isNull(publications.supersededBy));
      add(
        'ready',
        ids.filter(
          (id) =>
            evaluate(data, id).releasable &&
            !current.some((row) => row.institutionId === id),
        ).length,
        'Results ready to publish',
        'Every quarter has a final disposition. Publish them as a batch.',
        '/admin/annual',
      );
    }
    return items;
  }

  /**
   * Read-only support access to an institution's report as it stands, including an unsaved
   * draft (PRD §5.2: "logged support access only"). Each view needs a reason, is audited, and
   * the institution is told. Administrators never edit or submit on an institution's behalf.
   */
  @Post('support/obligations/:obligationId')
  @HttpCode(200)
  support(
    @CurrentUser() admin: User,
    @Param('obligationId') id: string,
    @Body() body: unknown,
  ): Promise<ReportBundle> {
    return write(this.db, async (tx, businessTime) => {
      const parsed = supportAccessRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Give the support reason in at least 20 characters.',
          'invalid_request',
          { reason: 'Give the support reason in at least 20 characters.' },
        );
      const [obligation] = await tx
        .select()
        .from(obligations)
        .where(eq(obligations.id, id));
      if (!obligation) throw notFound();
      const { bundle } = await loadReport(tx, obligation);
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'support.draft_view',
        {
          type: 'obligation',
          id: obligation.id,
          version: bundle.draft?.version ?? null,
        },
        `Support view of ${obligation.id}: ${parsed.data.reason}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${obligation.id}:support`),
        'support.access',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `An administrator viewed your ${bundle.period.label} report for support`,
          body: `${admin.displayName}: ${parsed.data.reason}. Nothing was changed.`,
          link: `/institution/reports/${bundle.period.id}`,
        },
      );
      return bundle;
    });
  }
}
