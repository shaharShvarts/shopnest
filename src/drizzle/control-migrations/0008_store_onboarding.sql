CREATE TYPE "public"."store_status" AS ENUM('draft', 'ready_for_provisioning', 'provisioned');--> statement-breakpoint
CREATE TABLE "stores" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "slug" varchar(63) NOT NULL,
  "status" "public"."store_status" DEFAULT 'draft' NOT NULL,
  "tenant_id" integer,
  "deleted_at" timestamp with time zone,
  "delete_finalizes_at" timestamp with time zone,
  "slug_released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stores_status_tenant_consistency"
    CHECK (
      ("status" = 'provisioned' AND "tenant_id" IS NOT NULL)
      OR
      ("status" IN ('draft', 'ready_for_provisioning') AND "tenant_id" IS NULL)
    ),
  CONSTRAINT "stores_delete_window_consistency"
    CHECK (
      ("deleted_at" IS NULL AND "delete_finalizes_at" IS NULL)
      OR
      ("deleted_at" IS NOT NULL AND "delete_finalizes_at" IS NOT NULL)
    ),
  CONSTRAINT "stores_slug_release_requires_delete"
    CHECK ("slug_released_at" IS NULL OR "deleted_at" IS NOT NULL),
  CONSTRAINT "stores_delete_finalizes_after_delete"
    CHECK (
      "delete_finalizes_at" IS NULL
      OR "delete_finalizes_at" >= "deleted_at"
    )
);--> statement-breakpoint
ALTER TABLE "stores"
  ADD CONSTRAINT "stores_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "public"."organizations"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint
ALTER TABLE "stores"
  ADD CONSTRAINT "stores_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id")
  REFERENCES "public"."tenants"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_slug_reserved_unique"
  ON "stores" USING btree ("slug")
  WHERE "slug_released_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_tenant_id_unique"
  ON "stores" USING btree ("tenant_id")
  WHERE "tenant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stores_organization_id_idx"
  ON "stores" USING btree ("organization_id");--> statement-breakpoint
DO $$
DECLARE
  legacy_slug text;
  legacy_schema text;
  legacy_tenant_id integer;
BEGIN
  FOR legacy_slug, legacy_schema IN
    SELECT *
    FROM (
      VALUES
        ('panda-pop', 'panda_pop'),
        ('gift-shop', 'gift_shop'),
        ('dvorik-collection', 'dvorik_collection')
    ) AS legacy(slug, schema_name)
  LOOP
    SELECT id
    INTO legacy_tenant_id
    FROM public.tenants
    WHERE slug = legacy_slug
      AND schema_name = legacy_schema;

    IF legacy_tenant_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspname = legacy_schema
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_user_tenants WHERE tenant_slug = legacy_slug
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_tenants WHERE tenant_slug = legacy_slug
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_oauth_transactions WHERE tenant_slug = legacy_slug
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stores WHERE tenant_id = legacy_tenant_id
      ) THEN
        DELETE FROM public.tenants
        WHERE id = legacy_tenant_id;
      ELSE
        RAISE NOTICE
          'Leaving legacy tenant % because schema or dependent control-plane data still exists',
          legacy_slug;
      END IF;
    END IF;

    legacy_tenant_id := NULL;
  END LOOP;
END $$;
