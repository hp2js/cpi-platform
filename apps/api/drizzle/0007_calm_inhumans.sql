CREATE TABLE "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"kind" text NOT NULL,
	"requested_by_role" text NOT NULL,
	"institution_id" text NOT NULL,
	"current_officer_id" text,
	"suggested_officer_id" text,
	"reason" text NOT NULL,
	"suggested_by_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"resolved_by_id" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "cover" jsonb;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "handover_note" text;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_suggested_by_id_users_id_fk" FOREIGN KEY ("suggested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;