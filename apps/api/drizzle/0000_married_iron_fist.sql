CREATE SEQUENCE "public"."record_ids" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "amendments" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"period_id" text NOT NULL,
	"milestone_id" text NOT NULL,
	"milestone_code" text NOT NULL,
	"change" text NOT NULL,
	"to_period_id" text,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_reason" text
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"officer_id" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"object_version" text,
	"summary" text NOT NULL,
	"business_time" timestamp with time zone NOT NULL,
	"actual_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"period_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"milestones" jsonb NOT NULL,
	"historical_seed" jsonb,
	"approval" jsonb,
	"returned" jsonb,
	CONSTRAINT "baselines_institutionId_periodId_version_unique" UNIQUE("institution_id","period_id","version")
);
--> statement-breakpoint
CREATE TABLE "calendar_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"by" text NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clarifications" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"obligation_id" text NOT NULL,
	"institution_id" text NOT NULL,
	"period_id" text NOT NULL,
	"revision" integer NOT NULL,
	"items" jsonb NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone NOT NULL,
	"response_due_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"response" jsonb,
	"closure" jsonb
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"obligation_id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"period_id" text NOT NULL,
	"reason" text NOT NULL,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"timezone" text NOT NULL,
	"foundation_deadline" timestamp with time zone NOT NULL,
	"evaluation_cutoff" timestamp with time zone NOT NULL,
	"profile_id" text NOT NULL,
	"reminder_days_before" jsonb NOT NULL,
	"overdue_notice" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"obligation_id" text NOT NULL,
	"milestone_id" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"revision" integer NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"carried_forward_from" text,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"event_type" text NOT NULL,
	"recipient_id" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_role" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "deliveries_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"obligation_id" text PRIMARY KEY NOT NULL,
	"form_version_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"version" integer NOT NULL,
	"saved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_sink" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"delivered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"obligation_id" text,
	"category" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"uploaded_by" text NOT NULL,
	"version" integer NOT NULL,
	"predecessor_id" text,
	"superseded_by" text
);
--> statement-breakpoint
CREATE TABLE "extensions" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"authorized_by" text NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"published_at" timestamp with time zone,
	"period_ids" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"weights" jsonb NOT NULL,
	"weights_locked" boolean NOT NULL,
	"based_on_version" integer,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "form_versions_cycleId_version_unique" UNIQUE("cycle_id","version")
);
--> statement-breakpoint
CREATE TABLE "foundation_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"kind" text NOT NULL,
	"version_id" text NOT NULL,
	"checks" jsonb NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foundation_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"evidence_id" text NOT NULL,
	"approval_reference" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"claimed_checks" jsonb NOT NULL,
	"withdrawn_reason" text
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"receipt_id" text NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"focal_contact" text DEFAULT '' NOT NULL,
	"accounting_officer_contact" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_eventId_recipientId_unique" UNIQUE("event_id","recipient_id")
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"period_id" text NOT NULL,
	"state" text NOT NULL,
	"current_revision" integer,
	"first_submitted_at" timestamp with time zone,
	"first_complete_evidence_at" timestamp with time zone,
	"last_receipt_at" timestamp with time zone,
	CONSTRAINT "obligations_institutionId_periodId_unique" UNIQUE("institution_id","period_id")
);
--> statement-breakpoint
CREATE TABLE "oversight_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"obligation_id" text NOT NULL,
	"revision" integer NOT NULL,
	"author" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" text NOT NULL,
	"quarter" integer NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"submission_deadline" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"run_id" text NOT NULL,
	"event_id" text NOT NULL,
	CONSTRAINT "processed_events_run_id_event_id_pk" PRIMARY KEY("run_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"version" integer NOT NULL,
	"batch_id" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"published_by" text NOT NULL,
	"superseded_by" text,
	"correction_reason" text,
	"profile_name" text NOT NULL,
	"evaluation" jsonb NOT NULL,
	"points" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"obligation_id" text NOT NULL,
	"institution_id" text NOT NULL,
	"receipt" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reopenings" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"reason" text NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"cause" text NOT NULL,
	"probability" integer NOT NULL,
	"impact" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"weights" jsonb NOT NULL,
	"procedures_mode" text NOT NULL,
	"checklists" jsonb NOT NULL,
	"formula_version" text NOT NULL,
	"rounding" text NOT NULL,
	"simulation" boolean NOT NULL,
	"source_note" text NOT NULL,
	"based_on" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"obligation_id" text NOT NULL,
	"revision" integer NOT NULL,
	"form_version_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"attestation" jsonb NOT NULL,
	"receipt_id" text NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by" text,
	CONSTRAINT "submissions_obligationId_revision_unique" UNIQUE("obligation_id","revision")
);
--> statement-breakpoint
CREATE TABLE "suitability" (
	"evidence_id" text PRIMARY KEY NOT NULL,
	"checks" jsonb NOT NULL,
	"deficient" boolean NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"run_id" text NOT NULL,
	"business_time" timestamp with time zone NOT NULL,
	"email_failure_mode" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"institution_id" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_to_period_id_periods_id_fk" FOREIGN KEY ("to_period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_profile_id_scoring_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."scoring_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_form_version_id_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extensions" ADD CONSTRAINT "extensions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_reviews" ADD CONSTRAINT "foundation_reviews_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_reviews" ADD CONSTRAINT "foundation_reviews_version_id_foundation_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."foundation_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_versions" ADD CONSTRAINT "foundation_versions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foundation_versions" ADD CONSTRAINT "foundation_versions_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oversight_comments" ADD CONSTRAINT "oversight_comments_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reopenings" ADD CONSTRAINT "reopenings_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reopenings" ADD CONSTRAINT "reopenings_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_version_id_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suitability" ADD CONSTRAINT "suitability_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;