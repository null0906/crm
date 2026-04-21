ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "services" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "service_other" text;
