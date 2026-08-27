ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "session_id" varchar;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cart_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_token" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "email" varchar;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_unique" UNIQUE("cart_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_token_unique" UNIQUE("checkout_token");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_or_session" CHECK ("orders"."user_id" IS NOT NULL OR "orders"."session_id" IS NOT NULL);