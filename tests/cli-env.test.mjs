import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  loadProjectEnv,
  projectEnvPath,
} from "../scripts/lib/load-project-env.mjs";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";

async function temporaryEnvFile(contents) {
  const directory = await mkdtemp(path.join(tmpdir(), "shopnest-env-"));
  const envFile = path.join(directory, ".env");
  await writeFile(envFile, contents, "utf8");
  return envFile;
}

test("project .env values are loaded", async () => {
  const key = "SHOPNEST_ENV_LOADER_TEST_VALUE";
  const original = process.env[key];
  delete process.env[key];
  try {
    const envFile = await temporaryEnvFile(`${key}=loaded\n`);
    assert.equal(loadProjectEnv(envFile), true);
    assert.equal(process.env[key], "loaded");
  } finally {
    restoreEnvironment(key, original);
  }
});

test("existing process environment values take precedence", async () => {
  const key = "SHOPNEST_ENV_LOADER_PRECEDENCE";
  const original = process.env[key];
  process.env[key] = "external";
  try {
    const envFile = await temporaryEnvFile(`${key}=from-file\n`);
    loadProjectEnv(envFile);
    assert.equal(process.env[key], "external");
  } finally {
    restoreEnvironment(key, original);
  }
});

test("a missing .env file does not crash", () => {
  assert.equal(loadProjectEnv(path.join(tmpdir(), "missing-shopnest.env")), false);
});

test("database configuration resolves after project environment loading", async () => {
  const keys = ["DATABASE_URL", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    const envFile = await temporaryEnvFile(
      "DB_USER=shopnest_test\nDB_PASSWORD=private_test_value\nDB_HOST=localhost\nDB_PORT=5432\nDB_NAME=shopnest_test\n"
    );
    loadProjectEnv(envFile);
    assert.equal(
      resolveDatabaseUrl(),
      "postgresql://shopnest_test:private_test_value@localhost:5432/shopnest_test"
    );
  } finally {
    for (const key of keys) restoreEnvironment(key, original[key]);
  }
});

test("the environment loader prints no secret values", async () => {
  const envFile = await temporaryEnvFile("SHOPNEST_SECRET_OUTPUT_TEST=do-not-print\n");
  const moduleUrl = pathToFileURL(
    path.resolve("scripts/lib/load-project-env.mjs")
  ).href;
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { loadProjectEnv } from ${JSON.stringify(moduleUrl)}; loadProjectEnv(${JSON.stringify(envFile)});`,
    ],
    { encoding: "utf8" }
  );
  assert.equal(child.status, 0);
  assert.equal(child.stdout, "");
  assert.equal(child.stderr, "");
});

test("the default env path is anchored to the repository, not cwd", () => {
  assert.equal(
    path.resolve(projectEnvPath),
    path.resolve(fileURLToPath(new URL("../.env", import.meta.url)))
  );
});

test("every database CLI entry point uses the shared loader", async () => {
  for (const script of [
    "admin-create.mjs",
    "admin-revoke.mjs",
    "tenant-create.mjs",
    "control-plane-migrate.mjs",
  ]) {
    const source = await readFile(
      fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)),
      "utf8"
    );
    assert.match(source, /loadProjectEnv\(\)/, script);
    assert.match(source, /\.\/lib\/load-project-env\.mjs/, script);
  }
});

function restoreEnvironment(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
