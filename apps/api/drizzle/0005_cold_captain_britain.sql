CREATE TABLE "supervisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"supervisor_id" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "cycles" ALTER COLUMN "day_counting" SET DEFAULT '{"mode":"calendar","reportingDays":15,"clarificationDays":7,"reviewTargetDays":10,"holidays":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "saved_by" text;--> statement-breakpoint
ALTER TABLE "oversight_comments" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "oversight_comments" ADD COLUMN "addressed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oversight_comments" ADD COLUMN "replies" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;