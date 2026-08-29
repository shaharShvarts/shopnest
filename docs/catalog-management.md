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

Local catalog images are stored in `public/categories`, `public/subcategories`,
or `public/products`, and their database value is an origin-relative URL such
as `/categories/example.jpg`. Legacy relative values such as
`categories/example.jpg`, `public/categories/example.jpg`, and old
tenant-prefixed catalog paths are normalized before display so a deep admin URL
cannot resolve them relative to itself. Absolute HTTPS object-storage URLs are
preserved.

Docker Compose mounts the three upload directories as named volumes so database
rows and their local files survive web-container rebuilds together. A database
row cannot recreate a file that was already lost before the volume existed; in
that case the admin preview reports that the stored image is unavailable and an
administrator must upload a replacement. Production platforms with ephemeral
or read-only filesystems should use object storage while keeping the same
portable URL field.

## Tenant isolation

No catalog action accepts a tenant slug from form data. The tenant is derived
from the trusted request context, authorized against the admin session, and
then mapped to its schema-specific database pool. A category or product created
for `panda-pop` is therefore not visible or mutable from `gift-shop` or
`dvorik-collection`.
