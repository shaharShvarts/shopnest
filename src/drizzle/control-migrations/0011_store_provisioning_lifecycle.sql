ALTER TABLE "stores" DROP CONSTRAINT "stores_status_tenant_consistency";--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stores"
  ALTER COLUMN "status" TYPE varchar(32)
  USING "status"::text;--> statement-breakpoint
DROP TYPE "public"."store_status";--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint

ALTER TABLE "stores"
  ADD COLUMN "activation_requested_at" timestamp with time zone,
  ADD COLUMN "provisioning_started_at" timestamp with time zone,
  ADD COLUMN "provisioned_at" timestamp with time zone,
  ADD COLUMN "last_provisioning_attempt_at" timestamp with time zone,
  ADD COLUMN "provisioning_attempt_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "last_provisioning_error_code" varchar(64);--> statement-breakpoint

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_status_check"
  CHECK (
    "status" IN (
      'draft',
      'ready_for_provisioning',
      'activation_requested',
      'provisioning',
      'provisioning_failed',
      'provisioned'
    )
  );--> statement-breakpoint

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_status_tenant_consistency"
  CHECK (
    ("status" = 'provisioned' AND "tenant_id" IS NOT NULL)
    OR
    ("status" <> 'provisioned' AND "tenant_id" IS NULL)
  );--> statement-breakpoint

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_provisioning_attempt_count_nonnegative"
  CHECK ("provisioning_attempt_count" >= 0);--> statement-breakpoint

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_provisioned_at_consistency"
  CHECK ("provisioned_at" IS NULL OR "status" = 'provisioned');--> statement-breakpoint

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_provisioning_error_code_format"
  CHECK (
    "last_provisioning_error_code" IS NULL
    OR "last_provisioning_error_code" ~ '^[A-Z0-9_]{1,64}$'
  );
