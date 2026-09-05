CREATE TABLE "payment_provider_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"configured_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_singleton" CHECK ("payment_provider_settings"."id" = 1),
	CONSTRAINT "payment_settings_provider" CHECK ("payment_provider_settings"."provider" in ('cardcom', 'pelecard', 'tranzila')),
	CONSTRAINT "payment_settings_environment" CHECK ("payment_provider_settings"."environment" in ('test', 'production'))
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"provider_transaction_id" text,
	"external_reference" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"redirect_url" text,
	"failure_code" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("payment_transactions"."amount" > 0),
	CONSTRAINT "payment_currency_valid" CHECK ("payment_transactions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payment_status_valid" CHECK ("payment_transactions"."status" in ('created','pending','paid','failed','cancelled','expired','review_required')),
	CONSTRAINT "payment_transaction_provider" CHECK ("payment_transactions"."provider" in ('cardcom', 'pelecard', 'tranzila')),
	CONSTRAINT "payment_transaction_environment" CHECK ("payment_transactions"."environment" in ('test', 'production')),
	CONSTRAINT "payment_confirmation_required" CHECK ("payment_transactions"."status" not in ('paid','review_required') or ("payment_transactions"."confirmed_at" is not null and "payment_transactions"."provider_transaction_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_order_unique" ON "payment_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_external_reference_unique" ON "payment_transactions" USING btree ("external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_transaction_unique" ON "payment_transactions" USING btree ("provider","environment","provider_transaction_id");--> statement-breakpoint
CREATE INDEX "payment_status_created_idx" ON "payment_transactions" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "order_payment_status_valid" CHECK ("orders"."payment_status" in ('pending', 'paid'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "order_paid_timestamp_required" CHECK ("orders"."payment_status" <> 'paid' or "orders"."paid_at" is not null);