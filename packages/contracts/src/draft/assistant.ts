import { z } from 'zod';
import { instantSchema } from './common.js';
import { suitabilityCheckKeys } from './review.js';

/*
 * Evidence assistant (PRD §14; "Hocus Pocus Assistant" is the project name only). On submission
 * (or when the officer asks again), per file, it makes suggestions about the questions they already answer; every
 * suggestion is traced to the file and the officer accepts, amends or dismisses each one. It
 * never records a suitability check, a decision or a score. Institutions never see any of it.
 */

export const assistantKinds = [
  'institution',
  'period',
  'passage',
  'citation',
  'approval',
  'missing',
] as const;
export const assistantKindSchema = z.enum(assistantKinds);
export type AssistantKind = z.infer<typeof assistantKindSchema>;

export const assistantKindLabels: Record<AssistantKind, string> = {
  institution: 'Whose document it is',
  period: 'Period covered',
  passage: 'Passage for a milestone',
  citation: 'Cited location',
  approval: 'Approval or signature wording',
  missing: 'Missing or unreadable',
};

export const assistantFindingSchema = z.enum([
  'match',
  'mismatch',
  'relevant',
  'found',
  'not_found',
  'present',
  'no_date',
  'no_signature',
  'unrelated',
]);
export type AssistantFinding = z.infer<typeof assistantFindingSchema>;

export const assistantDecisionSchema = z.object({
  outcome: z.enum(['accepted', 'amended', 'dismissed']),
  /** The officer's own wording when amended. */
  note: z.string(),
  by: z.string(),
  at: instantSchema,
});

export const assistantSuggestionSchema = z.object({
  id: z.string(),
  kind: assistantKindSchema,
  finding: assistantFindingSchema,
  milestoneCode: z.string().nullable(),
  /** Platform wording in the interface language; the quote stays in the document's language. */
  statement: z.string(),
  /** The passage it is based on; null only for checks the platform verified over the whole text. */
  quote: z.string().nullable(),
  /** 1-based page (PDF) or sheet (XLSX); null for the whole document. */
  page: z.number().int().positive().nullable(),
  decision: assistantDecisionSchema.nullable(),
});
export type AssistantSuggestion = z.infer<typeof assistantSuggestionSchema>;

/**
 * What the run's findings suggest for one suitability check (PRD §9.2, AT30). A hint only fills
 * the officer's form when they choose to use it; it is never recorded on its own and never
 * pre-selected. Dismissed suggestions do not count; an amended one counts with the officer's wording.
 */
export const assistantCheckHintSchema = z.object({
  check: z.enum(suitabilityCheckKeys),
  outcome: z.enum(['pass', 'deficient']),
  reason: z.string(),
  /** The suggestions it rests on; empty for readability, which comes from the reading itself. */
  basis: z.array(z.string()),
});
export type AssistantCheckHint = z.infer<typeof assistantCheckHintSchema>;

export const assistantRunSchema = z.object({
  id: z.string(),
  /** Suggestions belong to the exact file version they were made from. */
  evidenceId: z.string(),
  evidenceVersion: z.number().int().positive(),
  status: z.enum(['running', 'completed', 'failed', 'declined']),
  /** Why a run failed or was declined, in plain words. */
  message: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  promptRevision: z.string(),
  language: z.enum(['en', 'sw', 'mixed']).nullable(),
  unit: z.enum(['page', 'sheet', 'document']).nullable(),
  unreadablePages: z.array(z.number().int().positive()),
  /** Output that could not be traced to the file, or that quoted instruction-like text: never shown. */
  discarded: z.object({
    untraceable: z.number().int().nonnegative(),
    instructionLike: z.number().int().nonnegative(),
  }),
  /** Kinds withheld here: below the accuracy bar, or not reliable in the document's language. */
  hiddenKinds: z.array(assistantKindSchema),
  requestedBy: z.string(),
  requestedAt: instantSchema,
  durationMs: z.number().int().nonnegative().nullable(),
  suggestions: z.array(assistantSuggestionSchema),
  /** At most one per check; none when the findings say nothing about it. */
  checkHints: z.array(assistantCheckHintSchema),
});
export type AssistantRun = z.infer<typeof assistantRunSchema>;

export const assistantViewSchema = z.object({
  /** On for the deployment, with an approved provider. */
  enabled: z.boolean(),
  /** The assigned officer only; supervisors and administrators read. */
  canRun: z.boolean(),
  canDecide: z.boolean(),
  /** Newest first: this version's runs, then earlier versions' runs as history. */
  runs: z.array(assistantRunSchema),
});
export type AssistantView = z.infer<typeof assistantViewSchema>;

export const assistantDecisionRequestSchema = z
  .object({
    outcome: z.enum(['accepted', 'amended', 'dismissed']),
    note: z.string().trim().max(1000).default(''),
  })
  .refine((value) => value.outcome !== 'amended' || value.note.length >= 3, {
    path: ['note'],
    message: 'Write the amended suggestion (at least 3 characters).',
  });
export type AssistantDecisionRequest = z.input<
  typeof assistantDecisionRequestSchema
>;

export const assistantSettingsSchema = z.object({
  enabled: z.boolean(),
  /** False when the configured provider may not be used (no recorded terms, or real data unapproved). */
  available: z.boolean(),
  unavailableReason: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  /** Where requests go (host only), or "in-process" for the deterministic mode. */
  endpoint: z.string(),
  promptRevision: z.string(),
  termsRef: z.string().nullable(),
  hiddenKinds: z.array(assistantKindSchema),
  otherLanguageKinds: z.array(assistantKindSchema),
  maxPages: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  usage: z.object({
    runs: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    suggestions: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    amended: z.number().int().nonnegative(),
    dismissed: z.number().int().nonnegative(),
    discarded: z.number().int().nonnegative(),
  }),
});
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;

export const assistantSettingsRequestSchema = z.object({
  enabled: z.boolean(),
});

/*
 * The officer's chat with the evidence assistant about one submission: every readable file in
 * it, with the institution, period and citing milestones. Replies are AI-generated aids for the
 * officer to check against the files; like suggestions, they never record anything in the review.
 */
export const assistantChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['officer', 'assistant']),
  text: z.string(),
  by: z.string(),
  at: instantSchema,
  /** Who answered (assistant replies only). */
  provider: z.string().nullable(),
  model: z.string().nullable(),
});
export type AssistantChatMessage = z.infer<typeof assistantChatMessageSchema>;

export const assistantChatSchema = z.object({
  enabled: z.boolean(),
  /** The assigned officer only; supervisors and administrators read. */
  canAsk: z.boolean(),
  /** Oldest first. */
  messages: z.array(assistantChatMessageSchema),
});
export type AssistantChat = z.infer<typeof assistantChatSchema>;

export const assistantChatRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(2, 'Write a question.')
    .max(1000, 'Keep the question under 1,000 characters.'),
});
export type AssistantChatRequest = z.input<typeof assistantChatRequestSchema>;
