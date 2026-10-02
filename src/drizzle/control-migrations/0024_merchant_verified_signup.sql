ALTER TABLE "public"."merchant_accounts"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending_verification';

CREATE TABLE "public"."merchant_signup_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" integer NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_signup_tokens_token_hash_unique" UNIQUE("token_hash")
);

ALTER TABLE "public"."merchant_signup_tokens"
  ADD CONSTRAINT "merchant_signup_tokens_merchant_id_merchant_accounts_id_fk"
  FOREIGN KEY ("merchant_id")
  REFERENCES "public"."merchant_accounts"("id")
  ON DELETE cascade
  ON UPDATE no action;

CREATE INDEX "merchant_signup_merchant_idx"
  ON "public"."merchant_signup_tokens" USING btree ("merchant_id");

CREATE INDEX "merchant_signup_expires_at_idx"
  ON "public"."merchant_signup_tokens" USING btree ("expires_at");

CREATE INDEX "merchant_signup_created_at_idx"
  ON "public"."merchant_signup_tokens" USING btree ("created_at");
