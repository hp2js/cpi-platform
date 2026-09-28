CREATE TABLE "institution_types" (
	"id" text PRIMARY KEY NOT NULL,
	"position" serial NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
