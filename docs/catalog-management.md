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

Upload validation is authoritative on the server. Sharp 0.34.5 decodes the file
bytes with strict warning handling; it never selects a decoder from the filename,
browser MIME type, or Content-Type. Full pixel decoding checks every frame/page,
with an additional GIF block/trailer check because the decoder can recover a
truncated GIF without warning. Invalid, corrupt and unsupported data is rejected
before writing files or updating catalog rows, with an image-field error.

The bundled Sharp/libvips build supports JPEG, PNG, WebP, GIF, TIFF, AVIF and SVG.
There is no application input-format allowlist: any image buffer the installed
Sharp codecs can decode is accepted, subject to its built-in safety limits.
Additional codecs depend on the deployed libvips build; for example HEIC requires
HEVC support, which is not included in the standard binaries. Raw pixel arrays
without image headers are not file uploads and are not accepted.

Accepted images are normalized to PNG, with EXIF orientation applied and metadata
removed. SVG is rasterized, never served as active markup. Multi-page/animated
uploads are fully validated and their first frame becomes the static catalog
image. Existing stored JPEG/PNG/WebP/GIF/AVIF images remain readable.

The existing 5 MiB (5,242,880 byte) input limit is enforced both against File.size
and the actual bytes read. The multipart request envelope allows 6 MiB so a file
at the limit can be submitted. Client image/* filtering and the size hint are UX
only. NEXT_PUBLIC_VALID_IMAGE_TYPES and NEXT_PUBLIC_MAX_FILE_SIZE no longer make
server validation decisions; the shared byte limit lives in upload-limits.mjs.

Run `npm run image:test` for real format fixtures, MIME/extension spoofing,
corruption, animation truncation and byte-boundary tests. `npm run admin-ui:test`
checks upload/read/replace/delete lifecycles and cross-tenant path isolation using
real image fixtures.

Runtime uploads are not application source files and are not written to
Next.js `public/`. The local media store writes each image beneath a dedicated,
tenant-scoped directory:

```text
uploads/<tenant>/categories/<uuid>.<extension>
uploads/<tenant>/subcategories/<uuid>.<extension>
uploads/<tenant>/products/<uuid>.<extension>
```

The database stores only a portable browser path such as
`/gift-shop/media/categories/<uuid>.png`. A dynamic Route Handler reads the
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
