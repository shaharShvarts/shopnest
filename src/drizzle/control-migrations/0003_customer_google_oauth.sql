CREATE TABLE "customer_oauth_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" varchar(64) NOT NULL,
	"browser_binding_hash" varchar(64) NOT NULL,
	"tenant_slug" varchar(63) NOT NULL,
	"callback_path" varchar(2048) NOT NULL,
	"nonce_hash" varchar(64) NOT NULL,
	"code_verifier" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_oauth_transactions" ADD CONSTRAINT "customer_oauth_transactions_tenant_slug_tenants_slug_fk" FOREIGN KEY ("tenant_slug") REFERENCES "public"."tenants"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_oauth_transactions_state_hash_unique" ON "customer_oauth_transactions" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "customer_oauth_transactions_expires_at_idx" ON "customer_oauth_transactions" USING btree ("expires_at");