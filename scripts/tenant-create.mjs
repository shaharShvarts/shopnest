import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";
import {
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "../src/lib/tenant-validation.mjs";
import { provisionTenant } from "./lib/tenant-provisioning.mjs";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

loadProjectEnv();

const slugArgument = process.argv[2];

if (!slugArgument) {
  console.error("Usage: npm run tenant:create -- <tenant-slug>");
  process.exitCode = 1;
} else {
  const normalizedTenant = normalizeTenantSlug(slugArgument);
  if (!normalizedTenant) {
    console.error(`Invalid tenant slug: ${slugArgument}`);
    process.exitCode = 1;
  } else {
    const tenant = resolveConfiguredTenant(normalizedTenant.slug);
    if (!tenant) {
      console.error(`Tenant is not configured: ${normalizedTenant.slug}`);
      process.exitCode = 1;
    } else {
      try {
        const repositoryRoot = path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          ".."
        );
        const migrationsFolder = path.join(
          repositoryRoot,
          "src",
          "drizzle",
          "migrations"
        );

        console.log(`Tenant: ${tenant.slug}`);
        console.log(`Schema: ${tenant.schema}`);
        console.log("Creating schema...");
        console.log("Running migrations...");

        await provisionTenant({
          tenant,
          databaseUrl: resolveDatabaseUrl(),
          migrationsFolder,
        });

        console.log("Tenant ready.");
      } catch (error) {
        console.error(
          `Tenant provisioning failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        process.exitCode = 1;
      }
    }
  }
}
