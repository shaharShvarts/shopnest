# STAGING deployment and acceptance

This stack inherits the root Node 20 Alpine Dockerfile and lazy runtime database
initialization accepted in PR #24. No application, DEV, legacy Compose, tenant,
or payment behavior is changed. Always select this file explicitly; do not merge
it with `docker-compose.yml`, `docker-compose.dev.yml`, or `docker-compose.prod.yml`.

## Resources

Use Compose v2 with `!override` support (2.24.4+) for the parallel acceptance
override below. The canonical project name is: `shopnest-staging`.
Always pass the documented `-p`, even if the shell defines `COMPOSE_PROJECT_NAME`.
Do not set `container_name` or use external/shared volumes or networks.

The STAGING stack has passed real server acceptance, as reported by the operator.
Changing the Compose project name does not rename existing containers or volumes.
If the accepted deployment used a different project name, inventory and preserve
its database and uploads before switching; the canonical project creates separate
resources. Transfer accepted data only through an explicit, verified migration.

| Resource | Name / mapping |
| --- | --- |
| Services | `web-staging`, `db-staging`, `nginx-staging` |
| Default container names | `shopnest-staging-web-staging-1`, `shopnest-staging-db-staging-1`, `shopnest-staging-nginx-staging-1` |
| Network | `shopnest-staging_shopnest-staging-net` |
| PostgreSQL 17 volume | `shopnest-staging_pgdata-staging` |
| Uploads volume | `shopnest-staging_uploads-staging` at `/app/uploads` |
| Database / role | `shopnest_staging` / `shopnest_staging` |
| Internal DB endpoint | `db-staging:5432`; no host DB port |
| Web host port | `127.0.0.1:3002` -> `web-staging:3000` |
| Docker nginx host port | `127.0.0.1:8081` -> `nginx-staging:80` |
| Public TLS | Existing host nginx -> `127.0.0.1:8081` |

Repository inspection found the intended 3002 mapping in legacy
`docker-compose.prod.yml`; it also binds 80/443 and references missing paths.
DEV uses 3001/8080. Port 8081 is unused in the tracked configuration, but the
operator must verify host availability. Neither Docker service binds public
80/443. Legacy files remain intact for rollback.

## 1. Identify and preserve the existing deployment

Run on Ubuntu before creating resources. These commands avoid environment dumps
and credential-bearing inspect output. Keep inventory and backups private.

```bash
docker compose ls
docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Ports}}'
docker volume ls
docker network ls
sudo ss -ltnp | grep -E ':(80|443|3001|3002|8080|8081|13002|18081)\b'

# Repeat for each IDENTIFIED legacy STAGING web/nginx/database container ID.
# Replace the placeholder; do not select by a broad name match.
docker inspect --format '{{.Name}} project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}} mounts={{json .Mounts}}' LEGACY_CONTAINER_ID

# These must return no resources before the FIRST deployment of this new stack.
docker ps -a --filter label=com.docker.compose.project=shopnest-staging
docker volume ls --filter label=com.docker.compose.project=shopnest-staging
docker network ls --filter label=com.docker.compose.project=shopnest-staging
docker volume ls --format '{{.Name}}' | grep '^shopnest-staging_' || true
docker network ls --format '{{.Name}}' | grep '^shopnest-staging_' || true
```

Record the legacy checkout path, exact container IDs, Compose project, DB volume
or bind path, uploads path, and host nginx site configuration/upstream. Abort if
the new names already belong to another deployment; do not adopt existing data.
On subsequent deployments verify they belong to this accepted stack instead.
Back up the legacy DB and uploads using the existing deployment's private backup
procedure and verify restore capability. Do not print credentials, run broad
`docker inspect`, dump `.env` files, or publish expanded Compose configuration.

This is a fresh database deployment, not an automatic legacy data migration.
Provisioning creates schemas, not copies of existing orders, customers, catalog,
or uploads. If legacy data must be retained in the new stack, stop before cutover
and plan/test an explicit backup/restore migration with the operator. Never point
the new DB service at the old volume.

## 2. Separate checkout and private runtime settings

Do not change `/srv/shopnest/dev` or overwrite the legacy STAGING checkout.
For the first deployment, verify `/srv/shopnest/staging` does not exist, then:

```bash
test ! -e /srv/shopnest/staging
git clone --branch fix/staging-compose-alignment --single-branch \
  https://github.com/shaharShvarts/shopnest.git /srv/shopnest/staging
cd /srv/shopnest/staging
git pull --ff-only origin fix/staging-compose-alignment
git rev-parse HEAD
git ls-files --error-unmatch nginx.staging.conf
umask 077
touch .env.staging
chmod 600 .env.staging
${EDITOR:-vi} .env.staging
```

For an existing STAGING checkout, enter it, confirm its identity and clean status,
then fetch/switch/pull this branch. Use a private editor/secret manager to supply
`STAGING_DB_PASSWORD` (new, unique password) and
`STAGING_PAYMENT_ENCRYPTION_KEY` (new base64-encoded 32-byte encryption key).
Do not reuse DEV secrets. `.env.staging` is already excluded by `.gitignore` and
`.dockerignore`; never force-add it. Do not place secrets in Docker build args,
command history, image source files, logs, or PRs. Do not copy legacy `.env` files
wholesale. Add only required STAGING-specific integrations; no production Cardcom
credentials or activation. Encryption configuration alone does not enable payment
operations. Existing fail-closed payment and tenant checks remain in force.

Compose maps the two STAGING secret names to the application's runtime keys.
`DATABASE_URL` is forced empty to prevent legacy URL precedence; DB host, port,
user, and name are fixed. No DB credentials are needed by `npm run build`.
The database health check gates web startup. A healthy DB does not mean the
control-plane or tenant migrations have run.

## 3. Parallel acceptance without stopping legacy STAGING

Use the untracked override below when legacy STAGING owns 3002. Verify 13002 and
18081 are free first. `!override` replaces port lists instead of appending them.
The same new containers/volumes will be retained at cutover.

```bash
cat > .staging-acceptance.yml <<'YAML'
services:
  web-staging:
    ports: !override
      - "127.0.0.1:13002:3000"
  nginx-staging:
    ports: !override
      - "127.0.0.1:18081:80"
YAML
# Keep this local helper out of git without changing tracked ignore rules.
grep -qxF '.staging-acceptance.yml' .git/info/exclude || \
  printf '%s\n' '.staging-acceptance.yml' >> .git/info/exclude

dc() { docker compose -p shopnest-staging --env-file .env.staging \
  -f docker-compose.staging.yml -f .staging-acceptance.yml "$@"; }
dc config --quiet
dc up -d --build
dc ps
dc exec -T nginx-staging nginx -t
dc exec -T web-staging npm run control-plane:migrate
dc exec -T web-staging npm run tenant:list
dc exec -T web-staging npm run tenant:create -- panda-pop
# Repeat for each configured tenant that STAGING should serve.

# Direct web and nginx proxy must both return 200 after provisioning.
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: staging.shopnest.co.il' http://127.0.0.1:13002/panda-pop)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: staging.shopnest.co.il' -H 'X-Forwarded-Proto: https' http://127.0.0.1:18081/panda-pop)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: staging.shopnest.co.il' http://127.0.0.1:18081/unknown-staging-tenant)" = 404
dc exec -T db-staging psql -U shopnest_staging -d shopnest_staging \
  -c 'SELECT slug, status FROM public.tenants;' \
  -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'panda_pop';"
```

Stop on any failed command or unexpected HTTP status. Inspect the storefront in
a browser and verify tenant-specific content and uploads; an empty fresh catalog
is expected until populated. Do not use `/` as the tenant smoke test: legacy
unprefixed routes use public and are not the tenant acceptance target. Confirm
missing/unprovisioned tenant data never becomes public-store content. Do not
enable production payments for acceptance. Keep any diagnostic logs private.

## 4. Reversible cutover after acceptance

Confirm the operator accepts a fresh catalog or has completed the separately
approved data migration. Record the previous host nginx upstream and retain a
private backup of its site file. In a maintenance window, stop only the exact
legacy STAGING application container(s) that occupy 3002 (and any legacy proxy
that must be retired). Leave the legacy database and volumes intact:

```bash
docker stop VERIFIED_LEGACY_STAGING_WEB_CONTAINER_ID
# Only if required by the recorded topology:
# docker stop VERIFIED_LEGACY_STAGING_NGINX_CONTAINER_ID

dc() { docker compose -p shopnest-staging --env-file .env.staging \
  -f docker-compose.staging.yml "$@"; }
dc config --quiet
dc up -d --build
dc ps
dc exec -T nginx-staging nginx -t
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: staging.shopnest.co.il' http://127.0.0.1:3002/panda-pop)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: staging.shopnest.co.il' -H 'X-Forwarded-Proto: https' http://127.0.0.1:8081/panda-pop)" = 200
```

Edit only the existing `staging.shopnest.co.il` host nginx server/location to
proxy to `http://127.0.0.1:8081`. Preserve its TLS certificates, listeners,
redirects, and other sites. Its proxy location should preserve these headers:

```nginx
location / {
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
test "$(curl -sS -o /dev/null -w '%{http_code}' https://staging.shopnest.co.il/panda-pop)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' https://staging.shopnest.co.il/unknown-staging-tenant)" = 404
dc ps
```

Verify public TLS/browser storefront, tenant boundaries, admin redirects, and
upload persistence after recreation. Compare DEV container IDs and 3001/8080
availability against the preflight inventory; DEV must be unaffected.

Rollback: `dc stop web-staging nginx-staging`, restart the recorded legacy app
container IDs with `docker start`, restore the old host nginx upstream, then
`sudo nginx -t && sudo systemctl reload nginx`. Verify the old storefront.
Both databases/uploads remain intact. Account for any writes made to the new
stack before rollback; they are not automatically copied back.

Never run `down -v`, volume prune, system prune, or broad container removal as
part of this deployment. Destructive legacy cleanup is a separate, explicit
operator action only after new STAGING acceptance, verified backups, and an
agreed retention period. This runbook deliberately supplies no deletion command.

## Validation before deployment

Use a clean checkout with no `.env*` files and unset DB/payment secrets to run
`npm ci` and `npm run build`. Run `npm run database:test`, `npm run cli-env:test`,
`npm run tenant:test`, and `npm run payment:test` (the TypeScript suites require
a Node version supporting `--experimental-strip-types`). Run
`node --test tests/staging-compose.test.mjs` with Docker Compose installed;
it uses disposable dummy settings, requires no daemon, checks isolation and
legacy URL override, and rejects missing STAGING secrets. Run `git diff --check`
and verify the staged file list contains no `.env` or secret files.
`docker compose ... config --quiet` is intentional: plain `config` prints secrets.
Real Node 20 Alpine image build, container nginx validation, fresh DB migrations,
provisioning, HTTP acceptance, and cutover must still pass on the Ubuntu server.
