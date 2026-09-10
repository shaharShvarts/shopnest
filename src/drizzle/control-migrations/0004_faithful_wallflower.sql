CREATE TYPE "public"."tenant_plan" AS ENUM('small', 'medium', 'large');--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan" "tenant_plan" DEFAULT 'small' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "featured_rank" integer;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "support_notes" text;--> statement-breakpoint
CREATE INDEX "tenants_featured_rank_idx" ON "tenants" USING btree ("featured","featured_rank");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_featured_rank_positive" CHECK ("tenants"."featured_rank" IS NULL OR "tenants"."featured_rank" > 0);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_unfeatured_rank_null" CHECK ("tenants"."featured" OR "tenants"."featured_rank" IS NULL);