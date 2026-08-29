CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'tenant_admin');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'disabled');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "admin_role" DEFAULT 'tenant_admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "admin_user_tenants" (
	"admin_user_id" integer NOT NULL,
	"tenant_slug" varchar(63) NOT NULL,
	"role" varchar(32) DEFAULT 'tenant_admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_tenants_admin_user_id_tenant_slug_pk" PRIMARY KEY("admin_user_id","tenant_slug")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"admin_user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(63) NOT NULL,
	"schema_name" varchar(63) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_schema_name_unique" UNIQUE("schema_name")
);
--> statement-breakpoint
ALTER TABLE "admin_user_tenants" ADD CONSTRAINT "admin_user_tenants_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_tenants" ADD CONSTRAINT "admin_user_tenants_tenant_slug_tenants_slug_fk" FOREIGN KEY ("tenant_slug") REFERENCES "public"."tenants"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");
--> statement-breakpoint
INSERT INTO "tenants" ("slug", "schema_name", "display_name") VALUES
  ('panda-pop', 'panda_pop', 'Panda Pop'),
  ('dvorik-collection', 'dvorik_collection', 'Dvorik Collection'),
  ('gift-shop', 'gift_shop', 'Gift Shop')
ON CONFLICT ("slug") DO NOTHING;
