import { z } from 'zod';
import { instantSchema } from './common.js';

/*
 * The annual report's identity (HP2-65): who issues it and how it is branded. Set per cycle by
 * an administrator; each publication keeps the identity in force when it was published, so
 * changing the branding later never alters a published report. The simulation marking, the
 * layout and the accessibility rules are not part of it and cannot be changed.
 */

/** A logo or signature image, stored in object storage; the record keeps metadata only. */
export const reportImageSchema = z.object({
  id: z.string(),
  mimeType: z.enum(['image/png', 'image/jpeg']),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string(),
});
export type ReportImage = z.infer<typeof reportImageSchema>;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #530B61.');

/** The fields an administrator edits; images are uploaded separately. */
export const reportIdentityUpdateSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  reportTitle: z.string().trim().min(5).max(160),
  accentColor: hexColor,
  foreword: z.string().trim().max(2000),
  contact: z.string().trim().max(300),
  footer: z.string().trim().max(300),
  signatory: z
    .object({
      name: z.string().trim().min(2).max(120),
      title: z.string().trim().min(2).max(160),
    })
    .nullable(),
  /**
   * The recorded authorization to issue in the name of an official body (PRD §2, §22). Without
   * it, names such as EACC cannot appear as the issuer.
   */
  authorization: z.string().trim().max(300).nullable(),
});
export type ReportIdentityUpdate = z.infer<typeof reportIdentityUpdateSchema>;

export const reportIdentitySchema = reportIdentityUpdateSchema.extend({
  logo: reportImageSchema.nullable(),
  signature: reportImageSchema.nullable(),
});
export type ReportIdentity = z.infer<typeof reportIdentitySchema>;

/** Administrator view: the identity in force and its change history. */
export const reportIdentitySettingsSchema = z.object({
  identity: reportIdentitySchema,
  changes: z.array(
    z.object({ at: instantSchema, by: z.string(), summary: z.string() }),
  ),
});
export type ReportIdentitySettings = z.infer<
  typeof reportIdentitySettingsSchema
>;

export const reportImageSlotSchema = z.enum(['logo', 'signature']);
export type ReportImageSlot = z.infer<typeof reportImageSlotSchema>;
