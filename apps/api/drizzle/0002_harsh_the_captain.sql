CREATE TABLE "evidence_files" (
	"evidence_id" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amendments" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "clarifications" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "email_sink" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "oversight_comments" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "seq" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;