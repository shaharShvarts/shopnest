# Multi-tenant foundation

ShopNest supports schema-per-tenant routing while retaining the original
single-store routes.

## Routing

- `/<nest>` serves the existing storefront.
- `/<nest>/admin` serves the existing Basic Auth-protected admin UI.
- Nested storefront, admin, and API paths keep the same tenant prefix.
- `/` and `/admin` continue to use the database's default schema.

Tenant slugs are lowercase URL slugs containing letters, numbers, and single
hyphens. They are normalized to PostgreSQL identifiers by replacing hyphens
with underscores. For example, `panda-pop` uses schema `panda_pop`, and
`dvorik-collection` uses schema `dvorik_collection`. Invalid slugs and schema
names longer than PostgreSQL's 63-character identifier limit are rejected.

Only tenants in `CONFIGURED_TENANT_SLUGS` are accepted. The MVP allowlist is
`panda-pop`, `dvorik-collection`, and `gift-shop`. Unknown tenant paths return
404 before request context or database-pool creation.

## Database provisioning

Each tenant must have its own PostgreSQL schema before its URL is served. The
application deliberately does not fall back to `public` for a tenant request.
This prevents a missing tenant schema or table from exposing legacy-store data.

Provision and migrate a tenant with a database role that is allowed to create
schemas:

```sql
CREATE SCHEMA panda_pop;
```

Then run the existing Drizzle migrations with the connection's `search_path`
set to that schema. One way to do that locally is to set `PGOPTIONS` for the
migration process:

```text
PGOPTIONS=-c search_path=panda_pop npm run db:migrate
```

Repeat this for every tenant schema. Existing migrations and tables remain
unchanged; the migration history is applied independently inside each tenant
schema. Back up the database before provisioning production tenants.

## Current limitations

- Tenant discovery/provisioning is operational; there is no tenant-management
  UI or public tenant registry yet.
- Uploaded image files still share the application's `public` filesystem,
  although their database references are tenant-isolated.
- Admin credentials remain the existing global Basic Auth credentials.
- Payments are intentionally unchanged and are not part of this foundation.
- Existing top-level application route names are reserved and cannot be used
  as tenant slugs.
