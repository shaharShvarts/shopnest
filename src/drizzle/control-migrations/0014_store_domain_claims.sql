CREATE TABLE IF NOT EXISTS "public"."store_domain_claims" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "hostname" varchar(253) NOT NULL,
  "status" varchar(32) DEFAULT 'pending_verification' NOT NULL,
  "verification_token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "verified_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_domain_claims_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "store_domain_claims_status_check"
    CHECK ("status" IN ('pending_verification', 'verified', 'expired', 'consumed', 'cancelled')),
  CONSTRAINT "store_domain_claims_hostname_canonical_check"
    CHECK ("hostname" = lower("hostname") AND "hostname" !~ '\\.$'),
  CONSTRAINT "store_domain_claims_token_hash_check"
    CHECK ("verification_token_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "store_domain_claims_verified_at_check"
    CHECK ("status" NOT IN ('verified', 'consumed') OR "verified_at" IS NOT NULL),
  CONSTRAINT "store_domain_claims_consumed_at_check"
    CHECK ("status" <> 'consumed' OR "consumed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_domain_claims_pending_store_hostname_unique"
  ON "public"."store_domain_claims" USING btree ("store_id", "hostname")
  WHERE "status" = 'pending_verification';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_domain_claims_store_id_idx"
  ON "public"."store_domain_claims" USING btree ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_domain_claims_hostname_idx"
  ON "public"."store_domain_claims" USING btree ("hostname");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_domain_claims_status_expires_idx"
  ON "public"."store_domain_claims" USING btree ("status", "expires_at");
