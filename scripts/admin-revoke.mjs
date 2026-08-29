import { Pool } from "pg";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";
import { resolveConfiguredTenant } from "../src/lib/tenant-validation.mjs";

const email = process.argv[2]?.trim().toLowerCase();
const tenantSlug = process.argv[3]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npm run admin:revoke -- <email> [tenant-slug]");
if (tenantSlug && !resolveConfiguredTenant(tenantSlug)) {
  throw new Error(`Unknown configured tenant: ${tenantSlug}`);
}

const pool = new Pool({
  connectionString: resolveDatabaseUrl(),
  options: "-c search_path=public",
  max: 1,
});
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const user = await client.query(
    "SELECT id FROM public.admin_users WHERE email = $1 LIMIT 1",
    [email]
  );
  if (user.rowCount === 0) throw new Error("Admin user not found");
  const adminUserId = user.rows[0].id;

  if (tenantSlug) {
    await client.query(
      "DELETE FROM public.admin_user_tenants WHERE admin_user_id = $1 AND tenant_slug = $2",
      [adminUserId, tenantSlug]
    );
  } else {
    await client.query(
      "UPDATE public.admin_users SET is_active = false, updated_at = now() WHERE id = $1",
      [adminUserId]
    );
  }
  await client.query("DELETE FROM public.admin_sessions WHERE admin_user_id = $1", [
    adminUserId,
  ]);
  await client.query("COMMIT");
  console.log(
    tenantSlug
      ? `Revoked ${email} from ${tenantSlug}.`
      : `Disabled ${email} and revoked all sessions.`
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
