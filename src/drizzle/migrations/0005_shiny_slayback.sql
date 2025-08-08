ALTER TABLE "subcategories" ADD COLUMN "image_url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subcategories" DROP COLUMN "title";