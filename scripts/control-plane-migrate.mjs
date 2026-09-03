import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";
import { provisionControlPlane } from "./lib/control-plane-provisioning.mjs";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

loadProjectEnv();

try {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  console.log("Control plane: public");
  console.log("Running migrations...");
  await provisionControlPlane({
    databaseUrl: resolveDatabaseUrl(),
    migrationsFolder: path.join(
      repositoryRoot,
      "src",
      "drizzle",
      "control-migrations"
    ),
  });
  console.log("Control plane ready.");
} catch (error) {
  console.error(
    `Control-plane migration failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exitCode = 1;
}
