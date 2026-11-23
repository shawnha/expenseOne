BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE expenseone.tax_invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES expenseone.tax_invoice_requests(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  file_size integer NOT NULL CHECK (file_size BETWEEN 1 AND 4194304),
  file_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, file_hash)
);
CREATE INDEX idx_tax_invoice_attachments_request ON expenseone.tax_invoice_attachments(request_id, created_at, id);
ALTER TABLE expenseone.tax_invoice_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.tax_invoice_attachments FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tax-invoice-attachments', 'tax-invoice-attachments', false, 4194304,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);

DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'Storage objects must have RLS enabled.';
  END IF;
  IF pg_has_role((SELECT relowner FROM pg_class WHERE oid = 'storage.objects'::regclass), 'USAGE') THEN
    CREATE POLICY tax_invoice_attachments_server_only ON storage.objects AS RESTRICTIVE
      FOR ALL TO anon, authenticated
      USING (bucket_id <> 'tax-invoice-attachments')
      WITH CHECK (bucket_id <> 'tax-invoice-attachments');
  ELSIF EXISTS (
    -- Hosted Storage owns this table. Production's permissive policies grant
    -- client access only to the existing general expense attachments bucket.
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND permissive = 'PERMISSIVE'
      AND CASE cmd
        WHEN 'INSERT' THEN with_check IS DISTINCT FROM '(bucket_id = ''attachments''::text)'
        WHEN 'SELECT' THEN qual IS DISTINCT FROM '(bucket_id = ''attachments''::text)'
        WHEN 'DELETE' THEN qual IS DISTINCT FROM '(bucket_id = ''attachments''::text)'
        ELSE qual IS DISTINCT FROM '(bucket_id = ''attachments''::text)'
          OR coalesce(with_check, qual) IS DISTINCT FROM '(bucket_id = ''attachments''::text)'
      END
  ) THEN
    RAISE EXCEPTION 'Review Storage policies before creating the private tax invoice bucket.';
  END IF;
END $$;
COMMIT;
