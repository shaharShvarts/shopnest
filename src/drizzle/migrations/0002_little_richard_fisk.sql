ALTER TABLE "categories" 
ALTER COLUMN "title" SET DATA TYPE text;

ALTER TABLE "categories" RENAME COLUMN "title" TO "image_url";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "image_url" SET NOT NULL;