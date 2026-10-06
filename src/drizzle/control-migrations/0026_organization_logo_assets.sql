CREATE TABLE IF NOT EXISTS "public"."organization_logo_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "filename" varchar(255) NOT NULL,
  "content_type" varchar(64) DEFAULT 'image/png' NOT NULL,
  "byte_size" integer NOT NULL,
  CONSTRAINT "organization_logo_assets_byte_size_positive" CHECK ("byte_size" > 0),
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_logo_assets_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id")
    REFERENCES "public"."organizations"("id")
    ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_logo_assets_org_hash_unique"
  ON "public"."organization_logo_assets" USING btree ("organization_id", "content_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_logo_assets_organization_idx"
  ON "public"."organization_logo_assets" USING btree ("organization_id");
