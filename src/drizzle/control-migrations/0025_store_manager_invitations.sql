CREATE TABLE IF NOT EXISTS "public"."store_manager_invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "email" varchar(320) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_manager_invitations_store_id_stores_id_fk"
    FOREIGN KEY ("store_id")
    REFERENCES "public"."stores"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_manager_invitations_token_hash_unique"
  ON "public"."store_manager_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_manager_invitations_store_email_idx"
  ON "public"."store_manager_invitations" USING btree ("store_id", "email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_manager_invitations_expires_at_idx"
  ON "public"."store_manager_invitations" USING btree ("expires_at");
