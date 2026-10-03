CREATE TABLE IF NOT EXISTS "public"."store_manager_assignments" (
  "store_id" integer NOT NULL,
  "admin_user_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_manager_assignments_store_id_admin_user_id_pk"
    PRIMARY KEY ("store_id", "admin_user_id"),
  CONSTRAINT "store_manager_assignments_store_id_stores_id_fk"
    FOREIGN KEY ("store_id")
    REFERENCES "public"."stores"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "store_manager_assignments_admin_user_id_admin_users_id_fk"
    FOREIGN KEY ("admin_user_id")
    REFERENCES "public"."admin_users"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_manager_assignments_admin_user_id_idx"
  ON "public"."store_manager_assignments" USING btree ("admin_user_id");
