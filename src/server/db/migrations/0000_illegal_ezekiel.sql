CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"description" text,
	"is_system_role" boolean DEFAULT false,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"phone" varchar(20),
	"role_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255),
	"website" text,
	"industry" varchar(100),
	"sub_industry" varchar(100),
	"company_size" varchar(30),
	"annual_revenue_range" varchar(50),
	"company_type" varchar(30),
	"phone" varchar(30),
	"email" varchar(255),
	"address_line1" text,
	"address_line2" text,
	"city" varchar(100),
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100),
	"linkedin_url" text,
	"twitter_url" text,
	"owner_id" uuid,
	"created_by" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"description" text,
	"logo_url" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"last_contacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255),
	"secondary_email" varchar(255),
	"phone" varchar(30),
	"mobile" varchar(30),
	"job_title" varchar(150),
	"department" varchar(100),
	"company_id" uuid,
	"linkedin_url" text,
	"source" varchar(50),
	"status" varchar(30) DEFAULT 'new' NOT NULL,
	"lead_score" integer DEFAULT 0,
	"owner_id" uuid,
	"created_by" uuid NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" varchar(100),
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100),
	"description" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"last_contacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"color" varchar(7),
	"stage_type" varchar(20) DEFAULT 'active' NOT NULL,
	"default_probability" integer DEFAULT 0,
	"automation_config" jsonb DEFAULT '{}'::jsonb,
	"is_system_stage" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_stage_pipeline_slug" UNIQUE("pipeline_id","slug"),
	CONSTRAINT "uq_stage_pipeline_position" UNIQUE("pipeline_id","position")
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_by" uuid NOT NULL,
	"position" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_contacts" (
	"deal_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'stakeholder'
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"moved_by" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric(15, 2),
	"currency" varchar(3) DEFAULT 'INR',
	"probability" integer DEFAULT 0,
	"expected_close_date" date,
	"actual_close_date" date,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"won_reason" text,
	"primary_contact_id" uuid,
	"company_id" uuid,
	"owner_id" uuid,
	"created_by" uuid NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"position_in_stage" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_tags" (
	"company_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"tagged_by" uuid,
	"tagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_tags_company_id_tag_id_pk" PRIMARY KEY("company_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"tagged_by" uuid,
	"tagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_contact_id_tag_id_pk" PRIMARY KEY("contact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "deal_tags" (
	"deal_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"tagged_by" uuid,
	"tagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_tags_deal_id_tag_id_pk" PRIMARY KEY("deal_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(7),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"color" varchar(7) DEFAULT '#6B7280' NOT NULL,
	"category_id" uuid,
	"description" text,
	"created_by" uuid,
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"entity_type" varchar(20) NOT NULL,
	"field_type" varchar(30) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_required" boolean DEFAULT false,
	"default_value" jsonb,
	"validation_regex" text,
	"position" integer DEFAULT 0,
	"section" varchar(100),
	"is_visible_in_table" boolean DEFAULT true,
	"is_visible_in_form" boolean DEFAULT true,
	"is_filterable" boolean DEFAULT true,
	"is_searchable" boolean DEFAULT false,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_custom_field_entity_slug" UNIQUE("entity_type","slug")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type" varchar(30) NOT NULL,
	"subject" varchar(255),
	"body" text,
	"call_duration_seconds" integer,
	"call_outcome" varchar(30),
	"call_direction" varchar(10),
	"email_message_id" text,
	"email_thread_id" text,
	"meeting_start_at" timestamp with time zone,
	"meeting_end_at" timestamp with time zone,
	"meeting_location" text,
	"meeting_link" text,
	"task_due_date" date,
	"task_completed_at" timestamp with time zone,
	"task_priority" varchar(10),
	"contact_id" uuid,
	"company_id" uuid,
	"deal_id" uuid,
	"performed_by" uuid NOT NULL,
	"is_automated" boolean DEFAULT false,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"widget_type" varchar(30) NOT NULL,
	"title" varchar(150) NOT NULL,
	"subtitle" text,
	"color" varchar(7),
	"icon" varchar(50),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cache_ttl_seconds" integer DEFAULT 300,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false,
	"public_slug" varchar(100),
	"public_token" varchar(64),
	"is_default" boolean DEFAULT false,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_refresh_seconds" integer DEFAULT 0,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboards_public_slug_unique" UNIQUE("public_slug"),
	CONSTRAINT "dashboards_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"user_email" varchar(255),
	"ip_address" "inet",
	"user_agent" text,
	"action" varchar(30) NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid,
	"entity_name" varchar(255),
	"changes" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"columns" jsonb,
	"sort_config" jsonb,
	"group_by" varchar(100),
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"is_pinned" boolean DEFAULT false,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"entity_type" varchar(30),
	"entity_id" uuid,
	"is_read" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_contacts" ADD CONSTRAINT "deal_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_from_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_to_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_moved_by_users_id_fk" FOREIGN KEY ("moved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_tagged_by_users_id_fk" FOREIGN KEY ("tagged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tagged_by_users_id_fk" FOREIGN KEY ("tagged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_tags" ADD CONSTRAINT "deal_tags_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_tags" ADD CONSTRAINT "deal_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_tags" ADD CONSTRAINT "deal_tags_tagged_by_users_id_fk" FOREIGN KEY ("tagged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_category_id_tag_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tag_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_companies_domain" ON "companies" USING btree ("domain") WHERE "companies"."domain" IS NOT NULL AND "companies"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_companies_name" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_companies_industry" ON "companies" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "idx_companies_owner" ON "companies" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_companies_type" ON "companies" USING btree ("company_type");--> statement-breakpoint
CREATE INDEX "idx_companies_deleted" ON "companies" USING btree ("deleted_at") WHERE "companies"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_contacts_company" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_owner" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_status" ON "contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contacts_email" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_contacts_name" ON "contacts" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "idx_contacts_source" ON "contacts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_contacts_deleted" ON "contacts" USING btree ("deleted_at") WHERE "contacts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_stages_pipeline" ON "pipeline_stages" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_deal_contacts_contact" ON "deal_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_stage_history_deal" ON "deal_stage_history" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_stage_history_stage" ON "deal_stage_history" USING btree ("to_stage_id");--> statement-breakpoint
CREATE INDEX "idx_deals_pipeline" ON "deals" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_deals_stage" ON "deals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_deals_owner" ON "deals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_deals_status" ON "deals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deals_company" ON "deals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_deals_contact" ON "deals" USING btree ("primary_contact_id");--> statement-breakpoint
CREATE INDEX "idx_deals_close_date" ON "deals" USING btree ("expected_close_date");--> statement-breakpoint
CREATE INDEX "idx_deals_deleted" ON "deals" USING btree ("deleted_at") WHERE "deals"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_company_tags_tag" ON "company_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_contact_tags_tag" ON "contact_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_deal_tags_tag" ON "deal_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_tags_category" ON "tags" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_tags_name" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_custom_fields_entity" ON "custom_field_definitions" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_activities_contact" ON "activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_activities_company" ON "activities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_activities_deal" ON "activities" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_activities_type" ON "activities" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "idx_activities_performer" ON "activities" USING btree ("performed_by");--> statement-breakpoint
CREATE INDEX "idx_activities_occurred" ON "activities" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_activities_deleted" ON "activities" USING btree ("deleted_at") WHERE "activities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_widgets_dashboard" ON "dashboard_widgets" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_saved_views_entity" ON "saved_views" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_saved_views_creator" ON "saved_views" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_unread" ON "notifications" USING btree ("user_id","is_read");