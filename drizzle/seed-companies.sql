INSERT INTO expenseone.companies (name, slug, currency, slack_channel_id, sort_order)
VALUES
  ('한아원코리아', 'korea', 'KRW', 'C08SDPDFUEP', 0),
  ('한아원리테일', 'retail', 'KRW', NULL, 1),
  ('HOI', 'hoi', 'USD', NULL, 2)
ON CONFLICT (slug) DO NOTHING;
