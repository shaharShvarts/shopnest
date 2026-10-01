CREATE TABLE IF NOT EXISTS "public"."entitlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(160) NOT NULL,
  "description" varchar(1000),
  "value_type" varchar(16) DEFAULT 'integer' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "entitlements_value_type_check"
    CHECK ("value_type" IN ('boolean', 'integer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entitlements_code_unique"
  ON "public"."entitlements" USING btree ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."plan_entitlements" (
  "plan_id" integer NOT NULL,
  "entitlement_id" integer NOT NULL,
  "value" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plan_entitlements_plan_id_entitlement_id_pk"
    PRIMARY KEY ("plan_id", "entitlement_id"),
  CONSTRAINT "plan_entitlements_plan_id_plans_id_fk"
    FOREIGN KEY ("plan_id")
    REFERENCES "public"."plans"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "plan_entitlements_entitlement_id_entitlements_id_fk"
    FOREIGN KEY ("entitlement_id")
    REFERENCES "public"."entitlements"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "plan_entitlements_value_check"
    CHECK ("value" >= -1)
);
