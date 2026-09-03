import { Pool } from "pg";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";
import { hashAdminPassword } from "../src/lib/admin-auth/password.mjs";
import { resolveConfiguredTenant } from "../src/lib/tenant-validation.mjs";
import { provisionAdminAccount } from "./lib/admin-account-provisioning.mjs";
import { readAdminPassword } from "./lib/secure-password-prompt.mjs";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

loadProjectEnv();

const args = process.argv.slice(2);
const email = args[0]?.trim().toLowerCase();
const role = readFlag("--role") ?? "super_admin";
const tenantSlugs = [...new Set(readFlags("--tenant"))];

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
  await provisionAdminAccount(client, {
    email,
    passwordHash,
    role,
    tenantSlugs,
  });
  console.log(`Admin ready: ${email}`);
  console.log(`Role: ${role}`);
  if (tenantSlugs.length > 0) console.log(`Tenants: ${tenantSlugs.join(", ")}`);
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
