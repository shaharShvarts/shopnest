ALTER TABLE "public"."store_domain_claims"
  ADD COLUMN IF NOT EXISTS "cname_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_txt_check_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_cname_check_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "public"."store_domains"
  ADD COLUMN IF NOT EXISTS "lifecycle_role" varchar(32),
  ADD COLUMN IF NOT EXISTS "cname_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_manual_check_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "retire_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "redirect_to_domain_id" integer;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT "tenant_id"
    FROM "public"."store_domains"
    WHERE "status" = 'active'
    GROUP BY "tenant_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'multiple active custom domains exist for one tenant; lifecycle backfill requires operator review';
  END IF;
END $$;
--> statement-breakpoint

UPDATE "public"."store_domains"
SET
  "lifecycle_role" = CASE
    WHEN "status" = 'removed' THEN NULL
    WHEN "status" = 'active' THEN 'primary'
    ELSE 'candidate'
  END,
  "is_primary" = CASE WHEN "status" = 'active' THEN true ELSE false END
WHERE "lifecycle_role" IS NULL;
--> statement-breakpoint

ALTER TABLE "public"."store_domains"
  ADD CONSTRAINT "store_domains_redirect_to_domain_id_fk"
    FOREIGN KEY ("redirect_to_domain_id")
    REFERENCES "public"."store_domains"("id")
    ON DELETE SET NULL ON UPDATE no action,
  ADD CONSTRAINT "store_domains_lifecycle_role_check"
    CHECK ("lifecycle_role" IS NULL OR "lifecycle_role" IN ('candidate', 'primary', 'retiring')),
  ADD CONSTRAINT "store_domains_lifecycle_removed_check"
    CHECK (
      ("status" = 'removed' AND "lifecycle_role" IS NULL AND "is_primary" = false)
      OR
      ("status" <> 'removed' AND "lifecycle_role" IS NOT NULL)
    ),
  ADD CONSTRAINT "store_domains_primary_flag_consistency"
    CHECK ("is_primary" = ("lifecycle_role" = 'primary')),
  ADD CONSTRAINT "store_domains_retiring_metadata_check"
    CHECK (
      ("lifecycle_role" = 'retiring' AND "retire_at" IS NOT NULL AND "redirect_to_domain_id" IS NOT NULL)
      OR
      ("lifecycle_role" <> 'retiring' AND "retire_at" IS NULL AND "redirect_to_domain_id" IS NULL)
      OR
      ("lifecycle_role" IS NULL AND "retire_at" IS NULL AND "redirect_to_domain_id" IS NULL)
    ),
  ADD CONSTRAINT "store_domains_redirect_not_self"
    CHECK ("redirect_to_domain_id" IS NULL OR "redirect_to_domain_id" <> "id");
--> statement-breakpoint

ALTER TABLE "public"."store_domains"
  DROP CONSTRAINT IF EXISTS "store_domains_hostname_unique";
DROP INDEX IF EXISTS "store_domains_primary_tenant_unique";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "store_domains_hostname_bound_unique"
  ON "public"."store_domains" USING btree ("hostname")
  WHERE "status" <> 'removed';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_domains_primary_tenant_unique"
  ON "public"."store_domains" USING btree ("tenant_id")
  WHERE "lifecycle_role" = 'primary' AND "status" <> 'removed';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_domains_candidate_tenant_unique"
  ON "public"."store_domains" USING btree ("tenant_id")
  WHERE "lifecycle_role" = 'candidate' AND "status" <> 'removed';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_domains_retire_at_idx"
  ON "public"."store_domains" USING btree ("retire_at")
  WHERE "lifecycle_role" = 'retiring' AND "status" <> 'removed';
