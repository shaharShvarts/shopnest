# Multi-tenant foundation

ShopNest supports schema-per-tenant routing with separate platform and tenant
route trees. See [the route inventory](./route-audit.md) for every application endpoint.

## Routing

- `/<nest>` serves the existing storefront.
- `/<nest>/admin` serves the tenant-authorized admin UI and redirects an
  unauthenticated user to `/<nest>/admin/login`.
- Nested storefront, admin, and API paths keep the same tenant prefix.
- `/` is the public platform homepage with no storefront navigation or tenant DB access.
- `/admin/*` is the global super-admin control plane, backed by the public registry.
- Tenantless storefront URLs such as `/categories`, `/account`, and `/checkout`
  return 404. Only the global OAuth callback and retired payment endpoint are
  admitted as tenantless APIs; commerce APIs require a tenant prefix.
- Storefront and admin pages have physical `[tenant]` routes. Only tenant API and
  media handlers use internal rewrites. Middleware replaces browser-supplied tenant
  headers, and the tenant layout verifies the trusted slug against the route params.

Tenant slugs are lowercase URL slugs containing letters, numbers, and single
hyphens. They are normalized to PostgreSQL identifiers by replacing hyphens
with underscores. For example, `panda-pop` uses schema `panda_pop`, and
`dvorik-collection` uses schema `dvorik_collection`. Invalid slugs and schema
names longer than PostgreSQL's 63-character identifier limit are rejected.

Only tenants in `CONFIGURED_TENANT_SLUGS` are accepted for routing and
provisioning. The MVP allowlist is
`panda-pop`, `dvorik-collection`, and `gift-shop`. Unknown tenant paths return
404 before request context or database-pool creation.

The central `public.tenants` registry is authoritative for tenant status,
display name, and admin authorization. See [admin-authentication.md](./admin-authentication.md)
for the control-plane migration and access model.

## Database provisioning

Each tenant must have its own PostgreSQL schema before its URL is served. The
application deliberately does not fall back to `public` for a tenant request.
This prevents a missing tenant schema or table from exposing legacy-store data.

List the configured tenant registry and normalized schema names:

```bash
npm run tenant:list
```

Provision a configured tenant with the safe CLI:

```bash
npm run tenant:create -- panda-pop
```

The command automatically loads the private root `.env` and reads
`DATABASE_URL`. For compatibility with the existing application configuration,
`DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_NAME` may be supplied
instead. Existing variables supplied by the shell, CI, Docker, Vercel, or a
production secret manager take precedence over `.env`. Credentials are never
printed or stored in the command or repository, and `.env` remains uncommitted.

### Local usage

Add the database connection to the repository-root `.env`, then run the normal
npm command without `--env-file`:

```bash
npm run tenant:create -- panda-pop
```

Supplying the connection through the shell remains supported and overrides the
local `.env`. For example, in PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://..."
npm run tenant:create -- panda-pop
```

The database role must be allowed to create the tenant schema and objects in
it. Re-running the command is safe: schema creation uses `IF NOT EXISTS`, and
applied migration hashes are recorded in the tenant's own
`__drizzle_migrations` table.

### Production usage

1. Back up the database.
2. Inject `DATABASE_URL` from the production secret manager; do not place it in
   source control or command history.
3. Use a deployment role with only the schema/object privileges needed for
   provisioning.
4. Run `npm run tenant:list` and verify the intended tenant is configured.
5. Run `npm run tenant:create -- <tenant-slug>` from the deployed revision.

Provisioning validates the slug against the same allowlist used by the app,
rejects `public` as a tenant schema, acquires a PostgreSQL advisory lock, sets
and verifies the transaction-local `search_path`, and rewrites explicit
`"public".` qualifiers in existing Drizzle SQL to the validated tenant schema.
Schema creation, migrations, and migration-history updates commit atomically.
Existing migrations and legacy `public` tables are not modified.

## Current limitations

- Tenant discovery/provisioning still uses the static routing allowlist while
  status and authorization use the public registry. Both must be updated when
  onboarding a tenant until dynamic middleware discovery is introduced.
- Runtime media uses tenant-specific directories under the uploads root and
  tenant-prefixed media URLs; requests cannot select another tenant's schema.
- Tenant-management and suspension-management UI is available to active
  `super_admin` accounts through the platform `/admin` control plane.
- Payments are intentionally unchanged and are not part of this foundation.
- Existing top-level application route names are reserved and cannot be used
  as tenant slugs.
