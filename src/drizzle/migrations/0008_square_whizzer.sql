CREATE TABLE "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"product_id" integer NOT NULL,
	"image_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_product_id_image_id_pk" PRIMARY KEY("product_id","image_id"),
	CONSTRAINT "product_images_sort_order_non_negative" CHECK ("product_images"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_sort_unique" ON "product_images" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
DO $$
DECLARE
  product_row RECORD;
  new_image_id integer;
BEGIN
  FOR product_row IN
    SELECT id, image_url
    FROM products
    WHERE image_url IS NOT NULL
      AND image_url <> ''
  LOOP
    INSERT INTO images (image_url)
    VALUES (product_row.image_url)
    RETURNING id INTO new_image_id;

    INSERT INTO product_images (product_id, image_id, sort_order)
    VALUES (product_row.id, new_image_id, 0);
  END LOOP;
END
$$;
