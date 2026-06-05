UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{deals,read}',
  '"all"'::jsonb,
  true
)
WHERE slug = 'sales_rep'
  AND permissions #>> '{deals,read}' = 'own';
