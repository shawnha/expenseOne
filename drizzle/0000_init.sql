CREATE TYPE "public"."document_type" AS ENUM('ESTIMATE', 'BANK_COPY', 'ID_CARD', 'BIZ_LICENSE', 'RECEIPT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('OFFICE_SUPPLIES', 'SOFTWARE', 'TRAVEL', 'MEALS', 'EQUIPMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."expense_type" AS ENUM('CORPORATE_CARD', 'DEPOSIT_REQUEST');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('DEPOSIT_APPROVED', 'DEPOSIT_REJECTED', 'NEW_DEPOSIT_REQUEST');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('MEMBER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_key" varchar(500) NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "expense_type" NOT NULL,
	"status" "expense_status" NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"amount" integer NOT NULL,
	"category" "expense_category" NOT NULL,
	"merchant_name" varchar(200),
	"transaction_date" date NOT NULL,
	"card_last_four" char(4),
	"bank_name" varchar(50),
	"account_holder" varchar(100),
	"account_number" varchar(50),
	"requested_deposit_date" date,
	"rejection_reason" text,
	"submitted_by_id" uuid NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amount_positive" CHECK ("expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"related_expense_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(100) NOT NULL,
	"role" "user_role" DEFAULT 'MEMBER' NOT NULL,
	"department" varchar(100),
	"profile_image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_expense_id_expenses_id_fk" FOREIGN KEY ("related_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_expenses_submitted_status" ON "expenses" USING btree ("submitted_by_id","status");--> statement-breakpoint
CREATE INDEX "idx_expenses_type_status_created" ON "expenses" USING btree ("type","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_expenses_transaction_date" ON "expenses" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_read" ON "notifications" USING btree ("recipient_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient_created" ON "notifications" USING btree ("recipient_id","created_at");