INSERT INTO "public"."entitlements"
  ("code", "name", "description", "value_type", "created_at", "updated_at")
VALUES
  (
    'custom_domain',
    'Custom Domain',
    'Allow the Store to use its own custom domain.',
    'boolean',
    now(),
    now()
  ),
  (
    'media_storage_mb',
    'Media Storage',
    'Maximum media storage available to the Store, in megabytes.',
    'integer',
    now(),
    now()
  ),
  (
    'products_limit',
    'Products',
    'Maximum number of products allowed in the Store catalog.',
    'integer',
    now(),
    now()
  )
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "value_type" = EXCLUDED."value_type",
  "updated_at" = now();
