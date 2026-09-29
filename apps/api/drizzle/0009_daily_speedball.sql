CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"code" text NOT NULL,
	"risk_id" text NOT NULL,
	"title" text NOT NULL,
	"strategy" text NOT NULL,
	"output" text NOT NULL,
	"kpi" text NOT NULL,
	"target" text NOT NULL,
	"owner" text NOT NULL,
	"resource_reference" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_approvals" (
	"institution_id" text PRIMARY KEY NOT NULL,
	"approving_body" text NOT NULL,
	"approved_on" date NOT NULL,
	"reference" text NOT NULL,
	"accounting_officer" text NOT NULL,
	"document_version_id" text,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planned_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"code" text NOT NULL,
	"activity_id" text NOT NULL,
	"period_id" text NOT NULL,
	"title" text NOT NULL,
	"completion_condition" text NOT NULL,
	"evidence_expectation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_scale_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"by" text NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cycles" ALTER COLUMN "day_counting" SET DEFAULT '{"mode":"calendar","reportingDays":15,"clarificationDays":7,"reviewTargetDays":10,"proposalLeadDays":14,"holidays":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "risk_scale" jsonb DEFAULT '{"probability":["Rare","Unlikely","Possible","Likely","Almost certain"],"impact":["Insignificant","Minor","Moderate","Major","Severe"],"source":"Demonstration labels from common 1–5 risk practice; confirm against the EACC risk assessment template before use."}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "form_versions" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "form_versions" ADD COLUMN "changes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_approvals" ADD CONSTRAINT "plan_approvals_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_milestones" ADD CONSTRAINT "planned_milestones_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_milestones" ADD CONSTRAINT "planned_milestones_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_milestones" ADD CONSTRAINT "planned_milestones_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill for databases seeded before this migration: the new contract fields get defaults.
UPDATE "cycles" SET "day_counting" = "day_counting" || '{"proposalLeadDays":14}'::jsonb WHERE NOT ("day_counting" ? 'proposalLeadDays');--> statement-breakpoint
UPDATE "baselines" SET "returned" = "returned" || '{"failedChecks":[]}'::jsonb WHERE "returned" IS NOT NULL AND NOT ("returned" ? 'failedChecks');--> statement-breakpoint
UPDATE "baselines" SET "milestones" = (SELECT coalesce(jsonb_agg(CASE WHEN m ? 'activityId' THEN m ELSE m || '{"activityId":null}'::jsonb END ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements("milestones") WITH ORDINALITY AS t(m, ord));
