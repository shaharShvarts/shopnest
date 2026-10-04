ALTER TABLE "shipping_methods" DROP CONSTRAINT "shipping_methods_threshold_non_negative";--> statement-breakpoint
DROP INDEX "shipping_methods_code_unique";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_requires_address" boolean;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "requires_address" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "logo_url" varchar(512);--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipping_method_code";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipping_method_type";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "shipping_free_threshold_applied";--> statement-breakpoint
ALTER TABLE "shipping_methods" DROP COLUMN "code";--> statement-breakpoint
ALTER TABLE "shipping_methods" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "shipping_methods" DROP COLUMN "free_shipping_threshold";--> statement-breakpoint
DROP TYPE "public"."shipping_method_type";
DROP TYPE "shipping_method_type";
