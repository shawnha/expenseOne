INSERT INTO expenseone.companies (name, slug, slack_channel_id, sort_order)
VALUES
  ('한아원코리아', 'korea', 'C08SDPDFUEP', 0),
  ('한아원리테일', 'retail', NULL, 1)
ON CONFLICT (slug) DO NOTHING;
