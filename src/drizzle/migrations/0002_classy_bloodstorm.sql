CREATE TYPE "public"."reservation_state" AS ENUM('active', 'consumed', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."inventory_alert_type" AS ENUM('low_stock', 'critical_stock', 'out_of_stock');--> statement-breakpoint
CREATE TYPE "public"."inventory_notification_status" AS ENUM('pending', 'sent', 'failed', 'not_configured');--> statement-breakpoint
CREATE TABLE "inventory_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" integer NOT NULL,
	"alert_type" "inventory_alert_type" NOT NULL,
	"available_quantity" integer NOT NULL,
	"threshold" integer NOT NULL,
	"notification_status" "inventory_notification_status" DEFAULT 'not_configured' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "inventory_alert_available_non_negative" CHECK ("inventory_alerts"."available_quantity" >= 0),
	CONSTRAINT "inventory_alert_threshold_non_negative" CHECK ("inventory_alerts"."threshold" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "quantity_positive";--> statement-breakpoint
DROP INDEX "product_expiry_idx";--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "type" SET DEFAULT 'Checkout';--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "low_stock_threshold" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "critical_stock_threshold" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "cart_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "checkout_token" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "state" "reservation_state" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "reservations"
SET "checkout_token" = gen_random_uuid(),
    "state" = 'released',
    "released_at" = now(),
    "updated_at" = now();--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "checkout_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_alert_unresolved_unique" ON "inventory_alerts" USING btree ("product_id","alert_type") WHERE "inventory_alerts"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "inventory_alert_product_type_resolved_idx" ON "inventory_alerts" USING btree ("product_id","alert_type","resolved_at");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_attempt_product_unique" ON "reservations" USING btree ("checkout_token","product_id");--> statement-breakpoint
CREATE INDEX "reservation_active_product_expiry_idx" ON "reservations" USING btree ("product_id","state","expires_at");--> statement-breakpoint
CREATE INDEX "reservation_cart_attempt_idx" ON "reservations" USING btree ("cart_id","checkout_token");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "quantity_non_negative" CHECK ("products"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "low_stock_threshold_non_negative" CHECK ("products"."low_stock_threshold" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "critical_stock_threshold_non_negative" CHECK ("products"."critical_stock_threshold" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "critical_threshold_not_above_low" CHECK ("products"."critical_stock_threshold" <= "products"."low_stock_threshold");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservation_quantity_positive" CHECK ("reservations"."quantity" > 0);
