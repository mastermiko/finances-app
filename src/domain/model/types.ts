import type { z } from 'zod';
import type {
  accountSchema,
  accountTypeSchema,
  budgetSchema,
  categoryKindSchema,
  categorySchema,
  dateFormatSchema,
  exportDataSchema,
  exportEnvelopeSchema,
  goalSchema,
  importBatchSchema,
  importSourceSchema,
  localeSchema,
  metaSchema,
  operationKindSchema,
  operationSchema,
  operationStatusSchema,
  recurrenceSchema,
  recurrenceTemplateSchema,
  ruleMatchTypeSchema,
  ruleSchema,
  settingsSchema,
  tagSchema,
  themeSchema,
} from './schemas';

export type Operation = z.output<typeof operationSchema>;
export type OperationKind = z.output<typeof operationKindSchema>;
export type OperationStatus = z.output<typeof operationStatusSchema>;
export type Category = z.output<typeof categorySchema>;
export type CategoryKind = z.output<typeof categoryKindSchema>;
export type Budget = z.output<typeof budgetSchema>;
export type Account = z.output<typeof accountSchema>;
export type AccountType = z.output<typeof accountTypeSchema>;
export type ImportBatch = z.output<typeof importBatchSchema>;
export type ImportSource = z.output<typeof importSourceSchema>;
export type Settings = z.output<typeof settingsSchema>;
export type Theme = z.output<typeof themeSchema>;
export type AppLocale = z.output<typeof localeSchema>;
export type DateFormat = z.output<typeof dateFormatSchema>;
export type Meta = z.output<typeof metaSchema>;
export type Recurrence = z.output<typeof recurrenceSchema>;
export type RecurrenceTemplate = z.output<typeof recurrenceTemplateSchema>;
export type Rule = z.output<typeof ruleSchema>;
export type RuleMatchType = z.output<typeof ruleMatchTypeSchema>;
export type Tag = z.output<typeof tagSchema>;
export type Goal = z.output<typeof goalSchema>;
export type ExportData = z.output<typeof exportDataSchema>;
export type ExportEnvelope = z.output<typeof exportEnvelopeSchema>;
