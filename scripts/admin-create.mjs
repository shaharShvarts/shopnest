import { Pool } from "pg";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";
import { hashAdminPassword } from "../src/lib/admin-auth/password.mjs";
import { resolveConfiguredTenant } from "../src/lib/tenant-validation.mjs";
import { readAdminPassword } from "./lib/secure-password-prompt.mjs";

const args = process.argv.slice(2);
const email = args[0]?.trim().toLowerCase();
const role = readFlag("--role") ?? "super_admin";
const tenantSlugs = readFlags("--tenant");

if (!email || !/^\S+@\S+\.\S+$/.test(email)) fail("A valid email is required");
if (!new Set(["super_admin", "tenant_admin"]).has(role)) {
  fail("--role must be super_admin or tenant_admin");
}
if (role === "tenant_admin" && tenantSlugs.length === 0) {
  fail("A tenant_admin requires at least one --tenant <slug>");
}
for (const slug of tenantSlugs) {
  if (!resolveConfiguredTenant(slug)) fail(`Unknown configured tenant: ${slug}`);
}

const password = await readAdminPassword();
const passwordHash = await hashAdminPassword(password);
const pool = new Pool({
  connectionString: resolveDatabaseUrl(),
  options: "-c search_path=public",
  max: 1,
});
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const userResult = await client.query(
    `INSERT INTO public.admin_users (email, password_hash, role, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = true,
       updated_at = now()
     RETURNING id`,
    [email, passwordHash, role]
  );
  const adminUserId = userResult.rows[0].id;
  await client.query("DELETE FROM public.admin_sessions WHERE admin_user_id = $1", [
    adminUserId,
  ]);

  if (role === "tenant_admin") {
    for (const slug of tenantSlugs) {
      await client.query(
        `INSERT INTO public.admin_user_tenants (admin_user_id, tenant_slug)
         VALUES ($1, $2)
         ON CONFLICT (admin_user_id, tenant_slug) DO NOTHING`,
        [adminUserId, slug]
      );
    }
  }
  await client.query("COMMIT");
  console.log(`Admin ready: ${email}`);
  console.log(`Role: ${role}`);
  if (tenantSlugs.length > 0) console.log(`Tenants: ${tenantSlugs.join(", ")}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function readFlags(name) {
  return args.flatMap((value, index) =>
    value === name && args[index + 1] ? [args[index + 1]] : []
  );
}

function fail(message) {
  console.error(`Admin creation failed: ${message}`);
  process.exit(1);
}
