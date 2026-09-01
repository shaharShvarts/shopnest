CREATE TYPE "public"."customer_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."customer_auth_provider" AS ENUM('password', 'google', 'apple');--> statement-breakpoint
CREATE TABLE "customer_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"email_normalized" varchar(320) NOT NULL,
	"password_hash" varchar(255),
	"display_name" varchar(160),
	"email_verified_at" timestamp with time zone,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_accounts_email_normalized_unique" UNIQUE("email_normalized")
);--> statement-breakpoint
CREATE TABLE "customer_auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" integer NOT NULL,
	"provider" "customer_auth_provider" NOT NULL,
	"provider_account_id" varchar(320) NOT NULL,
	"provider_email" varchar(320),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"customer_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_sessions_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE TABLE "customer_tenants" (
	"customer_id" integer NOT NULL,
	"tenant_slug" varchar(63) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tenants_customer_id_tenant_slug_pk" PRIMARY KEY("customer_id", "tenant_slug")
);--> statement-breakpoint
ALTER TABLE "customer_auth_identities" ADD CONSTRAINT "customer_auth_identities_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tenants" ADD CONSTRAINT "customer_tenants_customer_id_customer_accounts_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tenants" ADD CONSTRAINT "customer_tenants_tenant_slug_tenants_slug_fk" FOREIGN KEY ("tenant_slug") REFERENCES "public"."tenants"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_auth_provider_account_unique" ON "customer_auth_identities" USING btree ("provider", "provider_account_id");--> statement-breakpoint
CREATE INDEX "customer_sessions_expires_at_idx" ON "customer_sessions" USING btree ("expires_at");
