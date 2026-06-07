UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{deals,read}',
  '"own"'::jsonb,
  true
)
WHERE slug = 'sales_rep';
