ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "location" varchar(255);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "location" varchar(255);
--> statement-breakpoint
