CREATE TYPE "public"."plan_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'trialing', 'active', 'past_due', 'cancelled', 'expired');--> statement-breakpoint

CREATE TABLE "plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(160) NOT NULL,
  "status" "public"."plan_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL,
  "store_id" integer,
  "tenant_id" integer,
  "plan_id" integer NOT NULL,
  "status" "public"."subscription_status" DEFAULT 'pending' NOT NULL,
  "trial_ends_at" timestamp with time zone,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "public"."organizations"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_store_id_stores_id_fk"
  FOREIGN KEY ("store_id")
  REFERENCES "public"."stores"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id")
  REFERENCES "public"."tenants"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk"
  FOREIGN KEY ("plan_id")
  REFERENCES "public"."plans"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "plans_code_unique"
  ON "plans" USING btree ("code");--> statement-breakpoint

CREATE UNIQUE INDEX "subscriptions_store_id_unique"
  ON "subscriptions" USING btree ("store_id")
  WHERE "store_id" IS NOT NULL;--> statement-breakpoint

CREATE INDEX "subscriptions_organization_id_idx"
  ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint

CREATE INDEX "subscriptions_tenant_id_idx"
  ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint

CREATE INDEX "subscriptions_plan_id_idx"
  ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint

INSERT INTO public.plans ("code", "name", "status")
VALUES
  ('small', 'Small', 'active'),
  ('medium', 'Medium', 'active'),
  ('large', 'Large', 'active')
ON CONFLICT ("code") DO NOTHING;
