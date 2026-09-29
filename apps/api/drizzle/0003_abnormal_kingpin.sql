ALTER TABLE "clarifications" ADD COLUMN "window_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "clarifications" ADD COLUMN "window_unit" text DEFAULT 'calendar' NOT NULL;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "day_counting" jsonb DEFAULT '{"mode":"calendar","reportingDays":15,"clarificationDays":7,"holidays":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "type_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "accounting_officer" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" text DEFAULT '' NOT NULL;