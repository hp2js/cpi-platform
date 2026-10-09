CREATE TABLE "report_identity_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"by" text NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_images" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"uploaded_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "report_identity" jsonb;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "identity" jsonb;