ALTER TABLE "deals" ADD COLUMN "partner_company_id" uuid;
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_partner_company_id_companies_id_fk" FOREIGN KEY ("partner_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_deals_partner_company" ON "deals" USING btree ("partner_company_id");
