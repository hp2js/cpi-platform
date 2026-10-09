CREATE TABLE "archived_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"year_id" text NOT NULL,
	"seq" integer NOT NULL,
	"institution_id" text NOT NULL,
	"version" integer NOT NULL,
	"batch_id" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"published_by" text NOT NULL,
	"superseded_by" text,
	"correction_reason" text,
	"profile_name" text NOT NULL,
	"evaluation" jsonb NOT NULL,
	"points" text NOT NULL,
	"identity" jsonb
);
--> statement-breakpoint
CREATE TABLE "closed_years" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"timezone" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"foundation_deadline" timestamp with time zone NOT NULL,
	"evaluation_cutoff" timestamp with time zone NOT NULL,
	"profile_id" text NOT NULL,
	"profile_name" text NOT NULL,
	"periods" jsonb NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"closed_by" text NOT NULL,
	"pending" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "archived_publications" ADD CONSTRAINT "archived_publications_year_id_closed_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."closed_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archived_publications" ADD CONSTRAINT "archived_publications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;