CREATE TABLE "store_policy_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL,
  "store_id" integer NOT NULL,
  "market" varchar(2) NOT NULL,
  "policy_type" varchar(64) NOT NULL,
  "version" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL,
  "status" varchar(16) DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_policy_documents_status_check"
    CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "store_policy_documents_version_positive"
    CHECK ("version" > 0),
  CONSTRAINT "store_policy_documents_publish_consistency"
    CHECK (
      ("status" = 'draft' AND "published_at" IS NULL)
      OR
      ("status" = 'published' AND "published_at" IS NOT NULL)
    )
);--> statement-breakpoint

ALTER TABLE "store_policy_documents"
  ADD CONSTRAINT "store_policy_documents_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "public"."organizations"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

ALTER TABLE "store_policy_documents"
  ADD CONSTRAINT "store_policy_documents_store_id_stores_id_fk"
  FOREIGN KEY ("store_id")
  REFERENCES "public"."stores"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "store_policy_documents_version_unique"
  ON "store_policy_documents" USING btree
  ("store_id", "market", "policy_type", "version");--> statement-breakpoint

CREATE INDEX "store_policy_documents_store_idx"
  ON "store_policy_documents" USING btree ("store_id");--> statement-breakpoint

CREATE INDEX "store_policy_documents_organization_idx"
  ON "store_policy_documents" USING btree ("organization_id");--> statement-breakpoint

CREATE INDEX "store_policy_documents_published_idx"
  ON "store_policy_documents" USING btree
  ("store_id", "market", "policy_type", "status");
