import { Inject, Injectable } from '@nestjs/common';
import {
  elevatedAuditActions,
  toCsv,
  type AdminAttention,
  type AuditEvent,
  type AuditPage,
  type ReportBundle,
} from '@cpi/contracts';
import { evaluate, loadAnnualData } from '../annual/data';
import { accountStatus, invitationExpiresAt } from '../auth/passwords';
import type { User } from '../auth/sessions';
import { DB, nextId, write, type Database } from '../database/db';
import { currentState } from '../database/state';
import { Events, institutionUsers } from '../events/events';
import { notFound } from '../http/api-error';
import { loadReport } from '../reporting/report';
import { AdminRepository } from './admin.repository';

export type AuditFilters = Record<string, string | undefined>;

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: AdminRepository,
    private readonly events: Events,
  ) {}

  async audit(query: AuditFilters): Promise<AuditPage> {
    const { all, events } = await this.filteredAudit(query);
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

  async auditCsv(query: AuditFilters): Promise<string> {
    const { events } = await this.filteredAudit(query);
    return toCsv(
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
    );
  }

  async attention(): Promise<AdminAttention> {
    const [
      { state, cycle },
      [
        deliveryRows,
        suggestionRows,
        institutionRows,
        userRows,
        assignmentRows,
        supervisionRows,
        published,
      ],
    ] = await Promise.all([
      currentState(this.db),
      this.repository.attentionRows(),
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
      const data = await loadAnnualData(this.db, ids);
      const current = await this.repository.currentPublications();
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

  /** Read-only, audited support view; the institution is told (PRD §5.2). */
  support(admin: User, id: string, reason: string): Promise<ReportBundle> {
    return write(this.db, async (tx, businessTime) => {
      const obligation = await this.repository.obligation(id, tx);
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
        `Support view of ${obligation.id}: ${reason}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${obligation.id}:support`),
        'support.access',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `An administrator viewed your ${bundle.period.label} report for support`,
          body: `${admin.displayName}: ${reason}. Nothing was changed.`,
          link: `/institution/reports/${bundle.period.id}`,
        },
      );
      return bundle;
    });
  }

  /**
   * Audit events matching the filters, newest first.
   * ponytail: filters in memory over the whole log; move to SQL WHERE/LIMIT when the log
   * reaches hundreds of thousands of rows.
   */
  private async filteredAudit(query: AuditFilters) {
    const { objectType, action, actor, from, to } = query;
    const elevated = query.elevated === 'true';
    const needle = query.q?.trim().toLowerCase();
    const all = await this.repository.auditEvents();
    return {
      all,
      events: all.filter(
        (event: AuditEvent) =>
          (!objectType || event.objectType === objectType) &&
          (!action || event.action === action) &&
          (!actor || event.actorName === actor) &&
          // Dates are local calendar dates against business time.
          (!from || event.businessTime.slice(0, 10) >= from) &&
          (!to || event.businessTime.slice(0, 10) <= to) &&
          (!elevated ||
            (elevatedAuditActions as readonly string[]).includes(
              event.action,
            )) &&
          (!needle ||
            `${event.summary} ${event.objectId} ${event.actorName} ${event.action}`
              .toLowerCase()
              .includes(needle)),
      ),
    };
  }
}
