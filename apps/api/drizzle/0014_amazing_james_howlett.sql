CREATE TABLE "financial_year_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"by" text NOT NULL,
	"year_id" text NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_years" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"foundation_deadline" timestamp with time zone NOT NULL,
	"evaluation_cutoff" timestamp with time zone NOT NULL,
	"profile_id" text NOT NULL,
	"periods" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"planned_at" timestamp with time zone NOT NULL,
	"planned_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_years" ADD CONSTRAINT "planned_years_profile_id_scoring_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."scoring_profiles"("id") ON DELETE no action ON UPDATE no action;