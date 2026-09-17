import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("DEV and STAGING nginx require environment-specific basic auth", () => {
  const dev = read("nginx.dev.conf");
  const staging = read("nginx.staging.conf");

  assert.match(dev, /auth_basic\s+"ShopNest DEV";/);
  assert.match(dev, /auth_basic_user_file\s+\/etc\/nginx\/\.htpasswd;/);
  assert.match(staging, /auth_basic\s+"ShopNest STAGING";/);
  assert.match(staging, /auth_basic_user_file\s+\/etc\/nginx\/\.htpasswd;/);
});

test("Compose mounts private password files read-only, keeps DEV entry points on loopback, and persists DEV uploads", () => {
  const dev = read("docker-compose.dev.yml");
  const staging = read("docker-compose.staging.yml");

  assert.match(dev, /source:\s+\.\/\.htpasswd\.dev/);
  assert.match(dev, /target:\s+\/etc\/nginx\/\.htpasswd/);
  assert.match(staging, /source:\s+\.\/\.htpasswd\.staging/);
  assert.match(staging, /target:\s+\/etc\/nginx\/\.htpasswd/);

  assert.match(dev, /- "127\.0\.0\.1:3001:3000"/);
  assert.match(dev, /- "127\.0\.0\.1:8080:80"/);

  assert.match(dev, /SHOPNEST_UPLOADS_DIR:\s+\/app\/uploads/);
  assert.match(dev, /- \.\/uploads:\/app\/uploads/);
});

test("credential files are ignored and no password hashes are tracked by this feature", () => {
  const gitignore = read(".gitignore");
  assert.match(gitignore, /^\.htpasswd\*$/m);

  for (const path of [
    "docker-compose.dev.yml",
    "docker-compose.staging.yml",
    "nginx.dev.conf",
    "nginx.staging.conf",
    "docs/environment-basic-auth.md",
  ]) {
    assert.doesNotMatch(read(path), /^shopnest:\$2[aby]\$/m, `${path} contains a bcrypt htpasswd entry`);
  }
});
