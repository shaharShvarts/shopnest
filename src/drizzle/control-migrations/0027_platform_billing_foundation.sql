CREATE TYPE "public"."platform_billing_status" AS ENUM('created', 'pending', 'paid', 'failed', 'cancelled', 'review_required');
--> statement-breakpoint
CREATE TABLE "platform_billing_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "subscription_id" integer NOT NULL,
  "organization_id" integer NOT NULL,
  "store_id" integer NOT NULL,
  "plan_id" integer NOT NULL,
  "plan_code_snapshot" varchar(64) NOT NULL,
  "plan_name_snapshot" varchar(160) NOT NULL,
  "billing_interval" varchar(16) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "amount_minor" integer NOT NULL,
  "status" "platform_billing_status" DEFAULT 'created' NOT NULL,
  "provider" varchar(64),
  "provider_reference" varchar(255),
  "external_reference" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_billing_attempts_billing_interval_check" CHECK ("platform_billing_attempts"."billing_interval" IN ('monthly', 'annual')),
  CONSTRAINT "platform_billing_attempts_currency_check" CHECK ("platform_billing_attempts"."currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "platform_billing_attempts_amount_nonnegative_check" CHECK ("platform_billing_attempts"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "platform_billing_attempts" ADD CONSTRAINT "platform_billing_attempts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platform_billing_attempts" ADD CONSTRAINT "platform_billing_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platform_billing_attempts" ADD CONSTRAINT "platform_billing_attempts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platform_billing_attempts" ADD CONSTRAINT "platform_billing_attempts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_billing_attempts_external_reference_unique" ON "platform_billing_attempts" USING btree ("external_reference");
--> statement-breakpoint
CREATE INDEX "platform_billing_attempts_subscription_id_idx" ON "platform_billing_attempts" USING btree ("subscription_id");
--> statement-breakpoint
CREATE INDEX "platform_billing_attempts_store_id_idx" ON "platform_billing_attempts" USING btree ("store_id");
