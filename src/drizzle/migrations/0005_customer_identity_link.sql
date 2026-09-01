ALTER TABLE "carts" ADD COLUMN "customer_account_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_account_id" integer;--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_user_or_session";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_or_session" CHECK ("orders"."user_id" IS NOT NULL OR "orders"."session_id" IS NOT NULL OR "orders"."customer_account_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_or_session" CHECK ("carts"."user_id" IS NOT NULL OR "carts"."session_id" IS NOT NULL OR "carts"."customer_account_id" IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "carts_active_customer_account_unique" ON "carts" USING btree ("customer_account_id") WHERE "carts"."is_active" = true AND "carts"."customer_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_customer_account_created_idx" ON "orders" USING btree ("customer_account_id", "created_at");
