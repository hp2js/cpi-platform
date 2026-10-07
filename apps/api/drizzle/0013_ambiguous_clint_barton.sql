CREATE TABLE "assistant_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"evidence_id" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_revision" text NOT NULL,
	"language" text,
	"unit" text,
	"unreadable_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discarded" jsonb DEFAULT '{"untraceable":0,"instructionLike":0}'::jsonb NOT NULL,
	"hidden_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "assistant_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"run_id" text NOT NULL,
	"kind" text NOT NULL,
	"finding" text NOT NULL,
	"milestone_code" text,
	"statement" text NOT NULL,
	"quote" text,
	"page" integer,
	"decision" jsonb
);
--> statement-breakpoint
ALTER TABLE "system_state" ADD COLUMN "assistant_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_suggestions" ADD CONSTRAINT "assistant_suggestions_run_id_assistant_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."assistant_runs"("id") ON DELETE no action ON UPDATE no action;