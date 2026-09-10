import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("rendered Compose stacks isolate data, ports and connections even with hostile env values", () => {
  const dir = mkdtempSync(join(tmpdir(), "shopnest-compose-"));
  try {
    const configs = ["dev", "staging"].map((name) => {
      const upper = name.toUpperCase();
      const envFile = join(dir, `.env.${name}`);
      const composeFile = join(dir, `docker-compose.${name}.yml`);
      writeFileSync(composeFile, readFileSync(resolve(`docker-compose.${name}.yml`)));
      writeFileSync(envFile, `${upper}_DB_PASSWORD=synthetic-password\n${upper}_PAYMENT_ENCRYPTION_KEY=synthetic-key\n`);
      const config = JSON.parse(execFileSync("docker", [
        "compose", "--env-file", envFile, "-f", composeFile,
        "config", "--format", "json",
      ], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://wrong/shared", DB_NAME: "shared", COMPOSE_PROJECT_NAME: "" } }));
      assert.equal(config.name, `shopnest-${name}`);
      const { web, db } = config.services;
      assert.equal(web.environment.DATABASE_URL, "");
      assert.equal(web.environment.DB_HOST, "db");
      assert.equal(web.environment.DB_NAME, `shopnest_${name}`);
      assert.equal(db.environment.POSTGRES_DB, web.environment.DB_NAME);
      assert.equal(db.environment.POSTGRES_PASSWORD, web.environment.DB_PASSWORD);
      assert.equal(web.environment.NODE_ENV, "production");
      assert.equal(web.environment.APP_ENV, name === "dev" ? "development" : "staging");
      assert.equal(web.ports[0].host_ip, "127.0.0.1");
      assert.equal(Number(web.ports[0].published), name === "dev" ? 3001 : 3002);
      assert.equal(db.ports, undefined);
      assert.equal(web.environment[`${upper}_DB_PASSWORD`], "synthetic-password");
      return config;
    });
    const names = (config) => [
      ...Object.values(config.volumes).map((v) => v.name),
      ...Object.values(config.networks).map((v) => v.name),
      ...Object.values(config.services).map((v) => v.container_name),
    ];
    assert.equal(names(configs[0]).filter((n) => names(configs[1]).includes(n)).length, 0);
    for (const config of configs) {
      for (const service of Object.values(config.services)) {
        for (const volume of service.volumes) {
          assert.equal(volume.type, "volume");
          assert.ok(config.volumes[volume.source]);
        }
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
