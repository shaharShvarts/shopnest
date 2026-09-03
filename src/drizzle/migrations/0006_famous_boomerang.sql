CREATE TYPE "public"."fulfillment_status" AS ENUM('unfulfilled', 'processing', 'shipped', 'delivered', 'ready_for_pickup', 'picked_up', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."shipping_method_type" AS ENUM('home_delivery', 'pickup_point', 'store_pickup');--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(64) NOT NULL,
	"type" "shipping_method_type" NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"free_shipping_threshold" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_methods_price_non_negative" CHECK ("shipping_methods"."price" >= 0),
	CONSTRAINT "shipping_methods_threshold_non_negative" CHECK ("shipping_methods"."free_shipping_threshold" IS NULL OR "shipping_methods"."free_shipping_threshold" >= 0),
	CONSTRAINT "shipping_methods_sort_order_safe" CHECK ("shipping_methods"."sort_order" >= -1000000 AND "shipping_methods"."sort_order" <= 1000000)
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "shipping_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "billing_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_code" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_name" varchar(120);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_type" "shipping_method_type";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_price" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_free_threshold_applied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "items_subtotal" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_total" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_status" "fulfillment_status" DEFAULT 'unfulfilled' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ready_for_pickup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_methods_code_unique" ON "shipping_methods" USING btree ("code");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_fulfillment_created_idx" ON "orders" USING btree ("fulfillment_status","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_amounts_non_negative" CHECK (("orders"."items_subtotal" IS NULL OR "orders"."items_subtotal" >= 0) AND ("orders"."shipping_total" IS NULL OR "orders"."shipping_total" >= 0) AND ("orders"."shipping_price" IS NULL OR "orders"."shipping_price" >= 0));