CREATE TABLE "estimate_scoping_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"section" varchar(200),
	"question" text NOT NULL,
	"answer" text,
	"is_section_header" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uq_scoping_answer_position" UNIQUE("document_id","position"),
	CONSTRAINT "scoping_answer_position_check" CHECK ("estimate_scoping_answers"."position" >= 0),
	CONSTRAINT "scoping_answer_header_check" CHECK ("estimate_scoping_answers"."is_section_header" = false OR "estimate_scoping_answers"."answer" IS NULL),
	CONSTRAINT "scoping_answer_question_length_check" CHECK (char_length("estimate_scoping_answers"."question") <= 2000),
	CONSTRAINT "scoping_answer_answer_length_check" CHECK ("estimate_scoping_answers"."answer" IS NULL OR char_length("estimate_scoping_answers"."answer") <= 20000)
);
--> statement-breakpoint
CREATE TABLE "estimate_scoping_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"source_format" varchar(10) NOT NULL,
	"sheet_name" varchar(100),
	"encoding" varchar(20),
	"row_count" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_scoping_document_estimate" UNIQUE("estimate_id"),
	CONSTRAINT "scoping_document_format_check" CHECK ("estimate_scoping_documents"."source_format" IN ('csv', 'xlsx')),
	CONSTRAINT "scoping_document_row_count_check" CHECK ("estimate_scoping_documents"."row_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "estimate_scoping_answers" ADD CONSTRAINT "estimate_scoping_answers_document_id_estimate_scoping_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."estimate_scoping_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_scoping_documents" ADD CONSTRAINT "estimate_scoping_documents_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_scoping_documents" ADD CONSTRAINT "estimate_scoping_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;