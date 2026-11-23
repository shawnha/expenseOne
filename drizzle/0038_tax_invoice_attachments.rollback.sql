BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Roll back the app first. Keep submitted evidence and its access rules if used.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM expenseone.tax_invoice_attachments)
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'tax-invoice-attachments') THEN
    RAISE EXCEPTION 'Tax invoice attachments exist. Preserve the attachment table and private bucket.';
  END IF;
END $$;
DROP TABLE expenseone.tax_invoice_attachments;
DELETE FROM storage.buckets WHERE id = 'tax-invoice-attachments';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'tax_invoice_attachments_server_only') THEN
    DROP POLICY tax_invoice_attachments_server_only ON storage.objects;
  END IF;
END $$;
COMMIT;
