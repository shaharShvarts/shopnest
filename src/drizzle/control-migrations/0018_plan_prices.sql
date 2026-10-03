CREATE TABLE IF NOT EXISTS "public"."plan_prices" (
  "plan_id" integer NOT NULL,
  "billing_interval" varchar(16) NOT NULL,
  "currency" varchar(3) DEFAULT 'ILS' NOT NULL,
  "amount_minor" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plan_prices_plan_id_billing_interval_currency_pk"
    PRIMARY KEY ("plan_id", "billing_interval", "currency"),
  CONSTRAINT "plan_prices_plan_id_plans_id_fk"
    FOREIGN KEY ("plan_id")
    REFERENCES "public"."plans"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "plan_prices_billing_interval_check"
    CHECK ("billing_interval" IN ('monthly', 'annual')),
  CONSTRAINT "plan_prices_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "plan_prices_amount_nonnegative_check"
    CHECK ("amount_minor" >= 0)
);
