import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("STAGING Compose isolates resources and overrides legacy runtime DB settings", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "shopnest-staging-compose-"));
  try {
    for (const file of ["docker-compose.staging.yml", "Dockerfile", "nginx.staging.conf"]) {
      copyFileSync(new URL(`../${file}`, import.meta.url), path.join(directory, file));
    }
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) {
      if (/^(COMPOSE_|STAGING_|DEV_|DB_|DATABASE_URL|PAYMENT_)/.test(key)) delete environment[key];
    }
    function config(settings, extraFiles = []) {
      writeFileSync(path.join(directory, ".env.staging"), settings);
      return spawnSync("docker", ["--config", directory, "compose", "--env-file", ".env.staging",
        "-f", "docker-compose.staging.yml", ...extraFiles, "config", "--format", "json"], {
        cwd: directory, env: environment, encoding: "utf8",
      });
    }
    const dummySettings = "STAGING_DB_PASSWORD=compose-test-only\nSTAGING_PAYMENT_ENCRYPTION_KEY=compose-test-only\n";
    const result = config(dummySettings + "DATABASE_URL=postgresql://legacy.invalid/legacy\nDB_HOST=legacy.invalid\nDB_NAME=legacy\nDB_USER=legacy\nDB_PORT=9999\nDB_PASSWORD=legacy\nPAYMENT_ENCRYPTION_KEY=legacy\n");
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    const model = JSON.parse(result.stdout);
    assert.equal(model.name, "shopnest-staging");
    assert.deepEqual(Object.keys(model.services).sort(), ["db-staging", "nginx-staging", "web-staging"]);
    const web = model.services["web-staging"];
    const db = model.services["db-staging"];
    const nginx = model.services["nginx-staging"];
    assert.equal(web.environment.DATABASE_URL, "");
    assert.equal(web.environment.DB_HOST, "db-staging");
    assert.equal(web.environment.DB_PORT, "5432");
    assert.equal(web.environment.DB_USER, "shopnest_staging");
    assert.equal(web.environment.DB_NAME, "shopnest_staging");
    assert.equal(web.environment.DB_PASSWORD, db.environment.POSTGRES_PASSWORD);
    assert.equal(web.environment.DB_PASSWORD, "compose-test-only");
    assert.equal(web.environment.PAYMENT_ENCRYPTION_KEY, "compose-test-only");
    assert.equal(db.environment.POSTGRES_DB, web.environment.DB_NAME);
    assert.equal(db.environment.POSTGRES_USER, web.environment.DB_USER);
    assert.equal(db.image, "postgres:17.0");
    assert.equal(db.ports, undefined);
    assert.equal(path.resolve(web.build.context), path.resolve(directory));
    assert.equal(web.build.dockerfile, "Dockerfile");
    assert.equal(web.build.args, undefined);
    assert.equal(web.build.secrets, undefined);
    assert.equal(web.depends_on["db-staging"].condition, "service_healthy");
    for (const [service, published, target] of [[web, "3002", 3000], [nginx, "8081", 80]]) {
      assert.equal(service.ports.length, 1);
      assert.equal(service.ports[0].host_ip, "127.0.0.1");
      assert.equal(service.ports[0].published, published);
      assert.equal(service.ports[0].target, target);
    }
    assert.equal(path.resolve(nginx.volumes[0].source), path.join(directory, "nginx.staging.conf"));
    assert.equal(nginx.volumes[0].target, "/etc/nginx/nginx.conf");
    assert.equal(nginx.volumes[0].read_only, true);
    assert.equal(nginx.volumes[0].bind?.create_host_path ?? false, false);
    assert.equal(db.volumes[0].source, "pgdata-staging");
    assert.equal(web.volumes[0].source, "uploads-staging");
    assert.equal(web.volumes[0].target, web.environment.SHOPNEST_UPLOADS_DIR);
    for (const [key, volume] of Object.entries(model.volumes)) {
      assert.equal(volume.name, `shopnest-staging_${key}`);
      assert.ok(!volume.external);
    }
    assert.deepEqual(Object.keys(model.volumes).sort(), ["pgdata-staging", "uploads-staging"]);
    assert.equal(model.networks["shopnest-staging-net"].name, "shopnest-staging_shopnest-staging-net");
    assert.ok(!model.networks["shopnest-staging-net"].external);
    for (const service of Object.values(model.services)) {
      assert.deepEqual(Object.keys(service.networks), ["shopnest-staging-net"]);
      assert.equal(service.container_name, undefined);
    }
    assert.doesNotMatch(JSON.stringify(model), /db-dev|web-dev|pgdata-dev|shopnest-dev-net|DEV_DB_PASSWORD|DEV_PAYMENT_ENCRYPTION_KEY/);
    // Validate the actual runbook override: Compose must replace, not append,
    // ports so legacy STAGING can remain live throughout parallel acceptance.
    const runbook = readFileSync(new URL("../docs/staging-deployment.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    const override = runbook.match(/<<'YAML'\n([\s\S]*?)\nYAML/)[1];
    writeFileSync(path.join(directory, ".staging-acceptance.yml"), override);
    const parallel = config(dummySettings, ["-f", ".staging-acceptance.yml"]);
    assert.equal(parallel.status, 0, parallel.stderr);
    const parallelModel = JSON.parse(parallel.stdout);
    assert.equal(parallelModel.name, model.name);
    assert.deepEqual(parallelModel.volumes, model.volumes);
    assert.deepEqual(parallelModel.networks, model.networks);
    for (const [name, port] of [["web-staging", "13002"], ["nginx-staging", "18081"]]) {
      assert.equal(parallelModel.services[name].ports.length, 1);
      assert.equal(parallelModel.services[name].ports[0].published, port);
      assert.equal(parallelModel.services[name].ports[0].host_ip, "127.0.0.1");
    }
    for (const settings of ["", "STAGING_DB_PASSWORD=compose-test-only\n", "STAGING_PAYMENT_ENCRYPTION_KEY=compose-test-only\n"]) {
      assert.notEqual(config(settings).status, 0, "Missing STAGING secrets must fail validation");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
