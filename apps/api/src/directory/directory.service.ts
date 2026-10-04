import { Inject, Injectable } from '@nestjs/common';
import type {
  AccountingOfficer,
  Assignment,
  Cycle,
  Institution,
  InstitutionProfile,
  Obligation,
} from '@cpi/contracts';
import { accountStatus } from '../auth/passwords';
import {
  canReadInstitution,
  readableInstitutionIds,
  reviewerName,
} from '../auth/scope';
import type { User } from '../auth/sessions';
import { DB, nextId, write, type Database } from '../database/db';
import { loadCycle } from '../database/state';
import { Events, assignedOfficers } from '../events/events';
import { notFound } from '../http/api-error';
import { toAssignments } from '../supervision/assignments';
import { DirectoryRepository } from './directory.repository';
import { toObligations } from './obligations';

@Injectable()
export class DirectoryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: DirectoryRepository,
    private readonly events: Events,
  ) {}

  cycle(): Promise<Cycle> {
    return loadCycle(this.db);
  }

  async institutions(user: User): Promise<Institution[]> {
    const readable = await readableInstitutionIds(this.db, user);
    if (readable.length === 0) return [];
    return this.repository.institutions(readable);
  }

  async institution(user: User, id: string): Promise<Institution> {
    if (!(await canReadInstitution(this.db, user, id))) throw notFound();
    const institution = await this.repository.institution(id);
    if (!institution) throw notFound();
    return institution;
  }

  async obligations(user: User, filter?: string): Promise<Obligation[]> {
    const readable = await readableInstitutionIds(this.db, user);
    if (filter && !readable.includes(filter)) throw notFound();
    const scope = filter ? [filter] : readable;
    if (scope.length === 0) return [];
    return toObligations(
      this.db,
      await this.repository.obligations(scope),
      user.role === 'institution' ? 'institution' : 'internal',
    );
  }

  /** Officers see only their own assignments. */
  async assignments(user: User): Promise<Assignment[]> {
    const readable = await readableInstitutionIds(this.db, user);
    if (readable.length === 0) return [];
    const rows = await this.repository.assignments(
      readable,
      user.role === 'officer' ? user.id : undefined,
    );
    return toAssignments(this.db, rows);
  }

  async profile(user: User): Promise<InstitutionProfile> {
    const institution = await this.repository.institution(
      user.institutionId ?? '',
    );
    if (!institution) throw notFound();
    const reviewer = await reviewerName(this.db, institution.id);
    const focal = await this.repository.focalPersons(institution.id);
    return {
      institution,
      reviewingOfficer: reviewer ?? null,
      focalPersons: focal.map((person) => ({
        id: person.id,
        displayName: person.displayName,
        jobTitle: person.jobTitle,
        email: person.email,
        status: accountStatus(person),
      })),
    };
  }

  /** Audited; the reviewing officer is told. */
  updateAccountingOfficer(
    user: User,
    input: AccountingOfficer,
  ): Promise<{ ok: true }> {
    return write(this.db, async (tx, businessTime) => {
      const institution = await this.repository.institutionRow(
        user.institutionId ?? '',
        tx,
      );
      if (!institution) throw notFound();
      const next = { ...input, email: input.email.toLowerCase() };
      const before = institution.accountingOfficer?.name;
      await this.repository.setAccountingOfficer(institution.id, next, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'institution.accounting_officer',
        { type: 'institution', id: institution.id },
        before && before !== next.name
          ? `Accounting Officer changed from ${before} to ${next.name}`
          : `Accounting Officer contact updated (${next.name})`,
      );
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${institution.id}:ao`),
        'institution.updated',
        await assignedOfficers(tx, institution.id),
        {
          title: `${institution.id} updated its Accounting Officer contact`,
          body: `${next.name}, ${next.designation}. Updated by ${user.displayName}.`,
          link: `/officer/institutions/${institution.id}`,
        },
      );
      return { ok: true as const };
    });
  }
}
