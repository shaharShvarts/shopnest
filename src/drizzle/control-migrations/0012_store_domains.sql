CREATE TABLE IF NOT EXISTS "public"."store_domains" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "hostname" varchar(253) NOT NULL,
  "type" varchar(32) DEFAULT 'custom' NOT NULL,
  "status" varchar(32) DEFAULT 'pending_verification' NOT NULL,
  "verification_token" varchar(128) NOT NULL,
  "verified_at" timestamp with time zone,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_domains_hostname_unique" UNIQUE("hostname"),
  CONSTRAINT "store_domains_verification_token_unique" UNIQUE("verification_token"),
  CONSTRAINT "store_domains_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "store_domains_type_check"
    CHECK ("type" IN ('custom')),
  CONSTRAINT "store_domains_status_check"
    CHECK ("status" IN ('pending_verification', 'verified', 'active', 'failed', 'removed')),
  CONSTRAINT "store_domains_verified_status_check"
    CHECK ("status" NOT IN ('verified', 'active') OR "verified_at" IS NOT NULL),
  CONSTRAINT "store_domains_hostname_canonical_check"
    CHECK ("hostname" = lower("hostname") AND "hostname" !~ '\\.$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_domains_primary_tenant_unique"
  ON "public"."store_domains" USING btree ("tenant_id")
  WHERE "is_primary" AND "status" <> 'removed';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_domains_tenant_id_idx"
  ON "public"."store_domains" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_domains_status_idx"
  ON "public"."store_domains" USING btree ("status");
