import { z } from 'zod';
import {
  calendarDateSchema,
  institutionIdSchema,
  instantSchema,
  roleSchema,
} from './common.js';
import { indicatorWeightsSchema } from './forms.js';

/**
 * Administrator configuration (PRD §7.1, FR01, FR02, §10.1, §12.1). Scoring profiles are
 * cycle-wide: a profile is applied to the cycle, not to a form version, and it locks when the
 * cycle's first form version is published. A different profile is tried in a new simulation run.
 */

const checklistSchema = z.array(z.string().trim().min(3).max(120)).length(4);

export const profileChecklistsSchema = z.object({
  procedures: checklistSchema,
  riskAssessment: checklistSchema,
  mitigationPlan: checklistSchema,
});
export type ProfileChecklists = z.infer<typeof profileChecklistsSchema>;

export const scoringProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  /**
   * `draft` is editable; `approved` is immutable and can be applied; `reference` documents a
   * structure (such as the published 23rd Cycle weights) that has not been validated for use.
   */
  status: z.enum(['draft', 'approved', 'reference']),
  weights: indicatorWeightsSchema,
  /** `prerequisite` shows procedures as a readiness condition with no points (weight 0). */
  proceduresMode: z.enum(['scored', 'prerequisite']),
  checklists: profileChecklistsSchema,
  /** The calculation the engine applies; fixed in v1 (PRD §10.5). */
  formulaVersion: z.string(),
  rounding: z.literal('half_up_2dp'),
  /** Simulation profiles are labelled on every internal score screen and export (§7.1). */
  simulation: z.boolean(),
  sourceNote: z.string(),
  basedOn: z.string().nullable(),
  createdAt: instantSchema,
  createdBy: z.string(),
  approvedAt: instantSchema.nullable(),
  approvedBy: z.string().nullable(),
  /** Problems that block approval; empty when the profile is valid. */
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});
export type ScoringProfile = z.infer<typeof scoringProfileSchema>;

export const profilesStateSchema = z.object({
  /** The profile the current cycle and run use. */
  cycleProfileId: z.string(),
  /** True once the cycle's first form version is published (§7.1). */
  locked: z.boolean(),
  lockedReason: z.string().nullable(),
  profiles: z.array(scoringProfileSchema),
});
export type ProfilesState = z.infer<typeof profilesStateSchema>;

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  weights: indicatorWeightsSchema,
  proceduresMode: z.enum(['scored', 'prerequisite']),
  checklists: profileChecklistsSchema,
  sourceNote: z.string().trim().max(1000),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Reminder schedule for quarterly deadlines (PRD §9.1 defaults: 7 and 1 days, and overdue). */
export const reminderScheduleSchema = z.object({
  daysBefore: z
    .array(z.number().int().min(1).max(30))
    .max(4)
    .refine((days) => new Set(days).size === days.length, 'Days must differ.'),
  overdueNotice: z.boolean(),
});
export type ReminderSchedule = z.infer<typeof reminderScheduleSchema>;

const lockSchema = z.object({
  editable: z.boolean(),
  /** Why the value can no longer change, in plain words. */
  reason: z.string().nullable(),
});

export const calendarSettingsSchema = z.object({
  cycleId: z.string(),
  label: z.string(),
  timezone: z.string(),
  periods: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      startsOn: calendarDateSchema,
      endsOn: calendarDateSchema,
      /** The deadline date; the last on-time instant is 23:59:59 local time that day. */
      deadlineDate: calendarDateSchema,
      lock: lockSchema,
    }),
  ),
  foundationDeadlineDate: calendarDateSchema,
  foundationLock: lockSchema,
  evaluationCutoffDate: calendarDateSchema,
  cutoffLock: lockSchema,
  reminders: reminderScheduleSchema,
  changes: z.array(
    z.object({
      at: instantSchema,
      by: z.string(),
      summary: z.string(),
      reason: z.string(),
    }),
  ),
});
export type CalendarSettings = z.infer<typeof calendarSettingsSchema>;

export const calendarUpdateSchema = z.object({
  deadlines: z.record(z.string(), calendarDateSchema),
  foundationDeadlineDate: calendarDateSchema,
  evaluationCutoffDate: calendarDateSchema,
  reminders: reminderScheduleSchema,
  reason: z.string().trim().min(10).max(500),
});
export type CalendarUpdate = z.infer<typeof calendarUpdateSchema>;

export const managedUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: roleSchema,
  institutionId: institutionIdSchema.nullable(),
  active: z.boolean(),
  /** Institutions currently assigned to an officer. */
  assignedInstitutionIds: z.array(institutionIdSchema),
});
export type ManagedUser = z.infer<typeof managedUserSchema>;

export const managedInstitutionSchema = z.object({
  id: institutionIdSchema,
  name: z.string(),
  type: z.string(),
  active: z.boolean(),
  focalContact: z.string(),
  accountingOfficerContact: z.string(),
});
export type ManagedInstitution = z.infer<typeof managedInstitutionSchema>;

export const peopleSchema = z.object({
  users: z.array(managedUserSchema),
  institutions: z.array(managedInstitutionSchema),
});
export type People = z.infer<typeof peopleSchema>;

export const userCreateSchema = z
  .object({
    displayName: z.string().trim().min(3).max(80),
    email: z
      .string()
      .trim()
      .regex(
        /^[^@\s]+@example\.invalid$/,
        'Use a fictional @example.invalid address.',
      ),
    role: roleSchema,
    institutionId: institutionIdSchema.nullable(),
  })
  .refine(
    (user) => (user.role === 'institution') === (user.institutionId !== null),
    {
      path: ['institutionId'],
      message: 'Institution users need an institution; other roles do not.',
    },
  );
export type UserCreate = z.infer<typeof userCreateSchema>;

export const userStatusSchema = z.object({
  active: z.boolean(),
  reason: z.string().trim().min(10).max(500),
});

export const institutionUpdateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  type: z.string().trim().min(3).max(80),
  focalContact: z.string().trim().max(200),
  accountingOfficerContact: z.string().trim().max(200),
});
export type InstitutionUpdate = z.infer<typeof institutionUpdateSchema>;
