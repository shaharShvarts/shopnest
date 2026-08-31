UPDATE "reservations" SET "type" = 'checkout';
ALTER TABLE "reservations" ALTER COLUMN "type" SET DEFAULT 'checkout';
ALTER TABLE "reservations" ADD COLUMN "started_at" timestamp with time zone;
ALTER TABLE "reservations" ADD COLUMN "last_activity_at" timestamp with time zone;
ALTER TABLE "reservations" ADD COLUMN "max_expires_at" timestamp with time zone;
UPDATE "reservations"
SET
  "last_activity_at" = LEAST(COALESCE("updated_at", "created_at", "expires_at"), "expires_at"),
  "started_at" = LEAST(COALESCE("created_at", "expires_at"), "expires_at"),
  "max_expires_at" = "expires_at";
ALTER TABLE "reservations" ALTER COLUMN "started_at" SET NOT NULL;
ALTER TABLE "reservations" ALTER COLUMN "started_at" SET DEFAULT now();
ALTER TABLE "reservations" ALTER COLUMN "last_activity_at" SET NOT NULL;
ALTER TABLE "reservations" ALTER COLUMN "last_activity_at" SET DEFAULT now();
ALTER TABLE "reservations" ALTER COLUMN "max_expires_at" SET NOT NULL;
ALTER TABLE "reservations" ADD CONSTRAINT "reservation_purpose_valid" CHECK ("reservations"."type" in ('cart', 'checkout'));
ALTER TABLE "reservations" ADD CONSTRAINT "reservation_expiry_order_valid" CHECK ("reservations"."started_at" <= "reservations"."last_activity_at" and "reservations"."last_activity_at" <= "reservations"."expires_at" and "reservations"."expires_at" <= "reservations"."max_expires_at");
