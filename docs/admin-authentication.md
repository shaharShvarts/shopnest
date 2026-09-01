# Tenant-aware admin authentication

ShopNest admin authentication uses central identities in PostgreSQL's `public`
schema and tenant-scoped authorization for every admin request. Browser Basic
Auth is no longer accepted.

## Architecture

The control plane and store data use separate Drizzle schemas, connections,
and migration directories:

- `src/drizzle/control-plane-schema.ts` and `control-migrations/` own public
  identity, session, and tenant-registry data. The control-plane connection
  explicitly sets `search_path=public`.
- `src/drizzle/schema.ts` and `migrations/` remain tenant-data only. Tenant
  provisioning rejects SQL containing control-plane tables before execution.
- Static `CONFIGURED_TENANT_SLUGS` remains the routing/provisioning allowlist
  during the MVP. `public.tenants` is authoritative for status, display name,
  and admin authorization. Adding a tenant currently requires updating the
  allowlist, provisioning its schema, and inserting its control-plane row.

Run public migrations before deploying code that uses admin authentication:

```bash
npm run control-plane:migrate
```

This runner acquires an advisory lock, verifies `current_schema()` is public,
uses normalized migration hashes, and records history in
`public.__shopnest_control_migrations`. It never scopes public migrations into
a tenant schema.

## Public tables

- `admin_users`: normalized email, scrypt password hash, global role, active
  flag, and timestamps. Global roles are `super_admin` and `tenant_admin`.
- `admin_user_tenants`: many-to-many tenant assignments. Its per-assignment
  role is a string so `tenant_staff` and finer tenant roles can be introduced
  without redesigning the identity model.
- `admin_sessions`: SHA-256 session-token hash, user, creation time, and
  expiry. Plaintext tokens are never stored in PostgreSQL.
- `tenants`: slug, schema name, display name, status, suspension metadata, and
  timestamps. Status is `active`, `suspended`, or `disabled`.

## Login and sessions

Tenant admins sign in at `/<tenant>/admin/login`; super admins sign in at
`/shopnest/admin/login`. Passwords are hashed with Node's scrypt using a random
salt. Login failures always return the generic `Invalid email or password`
message.

A successful login creates an eight-hour server-side session. The browser
receives only the random token in the `shopnest_admin_session` cookie, which is
HttpOnly, SameSite=Lax, path `/`, and Secure in production. Authentication
state is not stored in localStorage or in client-editable identity cookies.

Logout deletes the current database session before deleting the cookie.
Expired sessions are deleted when encountered. Every request reloads the
admin's active flag, so disabling an account invalidates existing sessions
immediately.

## Authorization rules

Tenant identity always comes from trusted middleware headers produced by the
existing URL resolver; it is never accepted from a form field or client-side
JavaScript.

For tenant admin pages, reads, Server Actions, and the admin subcategory API,
the server independently verifies:

1. the session exists and has not expired;
2. the admin user is active;
3. the URL tenant exists in `public.tenants`;
4. the user is assigned to that tenant, unless the user is a `super_admin`;
5. the tenant is active for a `tenant_admin`.

Unauthenticated page navigation redirects to that tenant's login page. A
cross-tenant or suspended-tenant request returns the controlled 403 response.
The server does not switch tenants or fall back to public store data.

`super_admin` can access every known tenant, including suspended or disabled
tenants, and the reserved `/shopnest/admin` foundation. The global page is
intentionally minimal in this release.

Customer pages for suspended or disabled tenants use the same controlled 403
response. Suspension management UI is future work.

## Bootstrap and access management

For local development, put `DATABASE_URL` (or the existing `DB_*` variables)
in the private, uncommitted root `.env`, apply control-plane migrations, and
create the first super admin:

```bash
npm run control-plane:migrate
npm run admin:create -- admin@example.com
```

The command prompts without echoing the password. In a non-interactive secure
deployment environment, inject `ADMIN_BOOTSTRAP_PASSWORD` for that process
only. The password must be at least 12 characters. The command prints neither
the password nor its hash and revokes previous sessions when updating a user.

ShopNest CLI entry points automatically load the project-root `.env`, even
when invoked from another working directory. Variables already supplied by
the shell, CI, Docker, Vercel, or a production secret manager always take
precedence and are never overwritten by `.env`. The loader prints no values;
keep `.env` private and uncommitted.

Create or update a tenant admin and assign one or more tenants:

```bash
npm run admin:create -- manager@example.com --role tenant_admin --tenant panda-pop --tenant gift-shop
```

Revoke one tenant assignment:

```bash
npm run admin:revoke -- manager@example.com gift-shop
```

Disable the account and revoke all sessions:

```bash
npm run admin:revoke -- manager@example.com
```

No production credentials are hard-coded in the repository.

## Future work

- Build tenant/status management and analytics under `/shopnest/admin`.
- Add `tenant_staff` permissions and finer per-assignment capabilities.
- Add session-management/audit views, rate limiting, password reset, and MFA.
- Move the static routing allowlist fully into a deployment-safe dynamic
  registry once middleware tenant discovery supports it.
