INSERT INTO "public"."entitlements"
  ("code", "name", "description", "value_type", "created_at", "updated_at")
VALUES
  (
    'store_managers',
    'Store Managers',
    'Maximum number of Store Managers assigned to one Store.',
    'integer',
    now(),
    now()
  )
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "value_type" = EXCLUDED."value_type",
  "updated_at" = now();
