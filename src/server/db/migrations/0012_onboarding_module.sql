CREATE TABLE IF NOT EXISTS onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid UNIQUE NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  primary_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  stage varchar(50) NOT NULL DEFAULT 'documents_pending',
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  msa_status varchar(20) DEFAULT 'pending', msa_sent_at date, msa_signed_at date,
  nda_status varchar(20) DEFAULT 'pending', nda_sent_at date, nda_signed_at date,
  sow_status varchar(20) DEFAULT 'pending', sow_sent_at date, sow_signed_at date,
  engagement_amount decimal(15,2), engagement_currency varchar(3) DEFAULT 'INR',
  engagement_amount_breakdown jsonb DEFAULT '{}', amount_variance_reason text,
  payment_terms varchar(50), payment_terms_notes text, po_received_at date, po_number varchar(100),
  first_payment_received_at date, first_payment_amount decimal(15,2),
  kickoff_scheduled_at timestamptz, kickoff_meeting_link text, kickoff_notes text,
  delivery_team_assigned uuid[] DEFAULT '{}',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  status varchar(20) NOT NULL DEFAULT 'active', completed_at timestamptz,
  converted_to_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboardings_stage_check CHECK (stage IN ('documents_pending','documents_sent','documents_signed','payment_pending','payment_received','kickoff_scheduled','completed','cancelled')),
  CONSTRAINT onboardings_status_check CHECK (status IN ('active','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_onboardings_deal ON onboardings(deal_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_company ON onboardings(company_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_stage ON onboardings(stage);
CREATE INDEX IF NOT EXISTS idx_onboardings_status ON onboardings(status);
CREATE INDEX IF NOT EXISTS idx_onboardings_owner ON onboardings(owner_id);

CREATE TABLE IF NOT EXISTS onboarding_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
  from_stage varchar(50), to_stage varchar(50) NOT NULL,
  moved_by uuid NOT NULL REFERENCES users(id), notes text,
  entered_at timestamptz NOT NULL DEFAULT now(), exited_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_onboarding_history_onboarding ON onboarding_stage_history(onboarding_id);

CREATE OR REPLACE VIEW deals_with_value AS
SELECT d.*, COALESCE(o.engagement_amount, d.amount, 0) AS effective_value,
  o.id AS onboarding_id, o.engagement_amount, o.engagement_currency,
  (o.engagement_amount IS NOT NULL) AS has_engagement_amount
FROM deals d
LEFT JOIN onboardings o ON o.deal_id = d.id AND o.status != 'cancelled';
