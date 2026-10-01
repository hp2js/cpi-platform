ALTER TABLE "evidence_files" ALTER COLUMN "bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "demonstration" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD COLUMN "bucket" text;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD COLUMN "object_key" text;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_object_unique" UNIQUE("bucket","object_key");--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_location" CHECK (("evidence_files"."bytes" IS NOT NULL AND "evidence_files"."bucket" IS NULL AND "evidence_files"."object_key" IS NULL) OR ("evidence_files"."bytes" IS NULL AND "evidence_files"."bucket" IS NOT NULL AND "evidence_files"."object_key" IS NOT NULL));
--> statement-breakpoint
-- Only the known seeded foundation IDs receive demonstration copies. Uploaded IDs are ev-NNNN.
UPDATE evidence SET demonstration = true
WHERE id LIKE 'ev-DEMO-%' AND obligation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM evidence_files WHERE evidence_files.evidence_id = evidence.id);
