CREATE TABLE "organizations" (
  "id" serial PRIMARY KEY NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "legal_name" varchar(200),
  "business_number" varchar(64),
  "vat_number" varchar(64),
  "email" varchar(320),
  "phone" varchar(64),
  "country" varchar(2) DEFAULT 'IL' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "organization_memberships" (
  "organization_id" integer NOT NULL,
  "merchant_account_id" integer NOT NULL,
  "role" varchar(32) DEFAULT 'owner' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_memberships_organization_id_merchant_account_id_pk"
    PRIMARY KEY("organization_id","merchant_account_id")
);--> statement-breakpoint
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_merchant_account_id_merchant_accounts_id_fk"
  FOREIGN KEY ("merchant_account_id")
  REFERENCES "public"."merchant_accounts"("id")
  ON DELETE cascade ON UPDATE no action;
