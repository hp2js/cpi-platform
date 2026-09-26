import { z } from 'zod';

/** An instant with an explicit UTC offset; the API never sends local wall-clock strings. */
export const instantSchema = z.iso.datetime({ offset: true });
/** A calendar date (YYYY-MM-DD) interpreted in the cycle's timezone. */
export const calendarDateSchema = z.iso.date();

export const roleSchema = z.enum([
  'institution',
  'officer',
  'supervisor',
  'administrator',
]);
export type Role = z.infer<typeof roleSchema>;

/** Stable institution identifier, e.g. DEMO-001. Display names may change; IDs do not. */
export const institutionIdSchema = z.string().regex(/^[A-Z]+-\d{3}$/);
export type InstitutionId = z.infer<typeof institutionIdSchema>;
