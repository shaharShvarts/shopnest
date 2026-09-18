CREATE TYPE "public"."merchant_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "merchant_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(320) NOT NULL,
  "email_normalized" varchar(320) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "phone_e164" varchar(32),
  "email_verified_at" timestamp with time zone,
  "status" "merchant_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_accounts_email_normalized_unique" UNIQUE("email_normalized")
);--> statement-breakpoint
CREATE TABLE "merchant_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "merchant_id" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_sessions_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE TABLE "merchant_password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" integer NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
ALTER TABLE "merchant_sessions" ADD CONSTRAINT "merchant_sessions_merchant_id_merchant_accounts_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_password_reset_tokens" ADD CONSTRAINT "merchant_password_reset_tokens_merchant_id_merchant_accounts_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_sessions_expires_at_idx" ON "merchant_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "merchant_password_reset_merchant_idx" ON "merchant_password_reset_tokens" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_password_reset_expires_at_idx" ON "merchant_password_reset_tokens" USING btree ("expires_at");
