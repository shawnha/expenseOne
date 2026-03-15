-- Migration: Change category from enum to varchar to support custom categories
ALTER TABLE "expenses" ALTER COLUMN "category" TYPE varchar(100) USING "category"::text;

-- Drop the old enum type
DROP TYPE IF EXISTS "expense_category";
