CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"submission_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"provider" text,
	"model" text
);
--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;