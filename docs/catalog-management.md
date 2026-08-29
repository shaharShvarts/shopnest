# Tenant catalog management

Catalog data is stored inside each tenant's PostgreSQL schema. Admin pages and
mutations obtain their database through `requireTenantAdminDb()`, so identifiers
submitted by a form are resolved only in the authenticated tenant schema.

## Relationships

- Every subcategory belongs to one category.
- Every product belongs to one category.
- A product may optionally belong to a subcategory.
- A direct-category product has `subcategory_id = NULL`.
- When `subcategory_id` is present, the server verifies that the subcategory's
  `category_id` matches the product's selected `category_id` before inserting or
  updating the product.

The product form filters subcategories when its category changes and clears a
selection that is no longer compatible. This client behavior is only a UX aid;
the same relationship is always validated against the tenant database on the
server.

## Visibility and deletion

The storefront returns active, non-deleted categories and active, available,
in-stock products. Products under an inactive subcategory are hidden. Direct
category products remain visible when their category and product are active.

Categories with products or subcategories, subcategories with products, and
products referenced by an order cannot be deleted. PostgreSQL foreign keys are
the final integrity boundary, and expected constraint failures are returned as
controlled admin messages.

## Images

Runtime uploads are not application source files and are not written to
Next.js `public/`. The local media store writes each image beneath a dedicated,
tenant-scoped directory:

```text
uploads/<tenant>/categories/<uuid>.<extension>
uploads/<tenant>/subcategories/<uuid>.<extension>
uploads/<tenant>/products/<uuid>.<extension>
```

The database stores only a portable browser path such as
`/gift-shop/media/categories/<uuid>.jpg`. A dynamic Route Handler reads the
file on every media request, so a new upload is available immediately without a
Next.js rebuild or restart. The handler accepts only configured tenants, the
three catalog media kinds, safe filenames, and known image extensions. It does
not expose arbitrary filesystem paths.

Legacy values such as `categories/example.jpg`,
`public/categories/example.jpg`, and old tenant-prefixed catalog paths are
resolved into the current tenant's media namespace. A URL carrying a different
tenant slug is rejected instead of being reassigned. Absolute HTTPS
object-storage URLs are preserved and are never passed to local file deletion.

Docker Compose mounts `shopnest_uploads` at `/app/uploads`, while retaining the
existing PostgreSQL volume. `SHOPNEST_UPLOADS_DIR` can select another dedicated
local directory. A database row cannot recreate a file already lost before
tenant-scoped storage existed; an administrator must upload a replacement.

This filesystem implementation is temporary for local/Docker use. The catalog
actions depend on the media-store API and keep portable URLs in PostgreSQL, so
the implementation can later be replaced by Vercel Blob or AWS S3 without
changing catalog database operations.

## Tenant isolation

No catalog action accepts a tenant slug from form data. The tenant is derived
from the trusted request context, authorized against the admin session, and
then mapped to its schema-specific database pool. A category or product created
for `panda-pop` is therefore not visible or mutable from `gift-shop` or
`dvorik-collection`.
