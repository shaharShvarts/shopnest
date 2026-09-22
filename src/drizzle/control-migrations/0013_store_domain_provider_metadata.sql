ALTER TABLE "public"."store_domains"
  ADD COLUMN IF NOT EXISTS "provider" varchar(32),
  ADD COLUMN IF NOT EXISTS "provider_hostname_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "provider_hostname_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "provider_ssl_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "provider_last_synced_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "provider_last_error_code" varchar(128),
  ADD COLUMN IF NOT EXISTS "provider_last_error_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "activation_requested_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_domains_provider_check'
      AND conrelid = 'public.store_domains'::regclass
  ) THEN
    ALTER TABLE "public"."store_domains"
      ADD CONSTRAINT "store_domains_provider_check"
      CHECK ("provider" IS NULL OR "provider" IN ('cloudflare'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_domains_provider_id_requires_provider_check'
      AND conrelid = 'public.store_domains'::regclass
  ) THEN
    ALTER TABLE "public"."store_domains"
      ADD CONSTRAINT "store_domains_provider_id_requires_provider_check"
      CHECK ("provider_hostname_id" IS NULL OR "provider" IS NOT NULL);
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_domains_provider_hostname_id_unique"
  ON "public"."store_domains" USING btree ("provider_hostname_id")
  WHERE "provider_hostname_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_domains_provider_idx"
  ON "public"."store_domains" USING btree ("provider");
