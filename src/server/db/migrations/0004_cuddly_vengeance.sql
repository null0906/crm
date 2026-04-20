ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "partner_company_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deals_partner_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE "deals"
    ADD CONSTRAINT "deals_partner_company_id_companies_id_fk"
    FOREIGN KEY ("partner_company_id")
    REFERENCES "public"."companies"("id")
    ON DELETE set null
    ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deals_partner_company" ON "deals" USING btree ("partner_company_id");
