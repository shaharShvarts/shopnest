ALTER TABLE "products" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'available'::text;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'available'::"public"."product_status";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "status" SET DATA TYPE "public"."product_status" USING "status"::"public"."product_status";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "sku";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "barcode";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "weight";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "dimensions";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "brand";