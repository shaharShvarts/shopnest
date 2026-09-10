# Isolated DEV and STAGING on Linux

These are standalone Compose files, not overrides. Never combine them with
docker-compose.yml or docker-compose.prod.yml. No automatic deployment is added.

| Resource | DEV | STAGING |
| --- | --- | --- |
| Source | selected feature branch | master |
| APP_ENV / NODE_ENV | development / production | staging / production |
| HTTPS | dev.shopnest.co.il | staging.shopnest.co.il |
| Loopback web port | 3001 | 3002 |
| Compose project | shopnest-dev | shopnest-staging |
| Containers | shopnest-dev-web/db | shopnest-staging-web/db |
| Database and role | shopnest_dev | shopnest_staging |
| DB volume | shopnest_dev_pgdata | shopnest_staging_pgdata |
| Upload volume | shopnest_dev_uploads | shopnest_staging_uploads |
| Network | shopnest_dev_network | shopnest_staging_network |
| Private env file | .env.dev | .env.staging |

PostgreSQL listens only inside its own Docker network on 5432. Neither 5433 nor
5434 is published. Web ports bind 127.0.0.1. Fixed resource names prevent changing
the checkout directory or Compose project name from silently selecting another
environment's resources. Do not override project/resource names (including COMPOSE_PROJECT_NAME or -p) or attach external volumes.
The host Docker administrator can access both environments; this is container,
network and data isolation, not a separate-host security boundary.

Each database has its own public control plane, tenant schemas, users and sessions.
Tenant routing, schema validation, search_path and admin/customer authorization are
unchanged. Browser tenant/schema selectors remain untrusted. Do not copy production
DB snapshots, payment credentials or uploads into these environments. Provision
synthetic tenant data separately. Uploaded media uses each stack's /app/uploads.

## Prerequisites and checkout

Install Git, Docker Engine with Compose v2, host Nginx, Certbot and OpenSSL using
your Linux distribution's packages. Allow inbound 80/443 only as needed plus your
restricted SSH access. Point both DNS A records to this server; add AAAA only if
IPv6 is configured. Ensure ports 3001/3002 are free:

```bash
sudo ss -ltnp | grep -E ':(80|443|3001|3002|5433|5434)\b' || true
sudo mkdir -p /srv/shopnest
sudo chown "$USER":"$(id -gn)" /srv/shopnest
git clone https://github.com/shaharShvarts/shopnest.git /srv/shopnest/dev
git -C /srv/shopnest/dev switch feature/dev-staging-environments
git clone --branch master https://github.com/shaharShvarts/shopnest.git /srv/shopnest/staging
```

STAGING commands require this PR to be reviewed and merged separately first.
This task does not merge it. After that, keep STAGING on master:

```bash
git -C /srv/shopnest/staging pull --ff-only origin master
```

For DEV, switch /srv/shopnest/dev to the desired feature branch before rebuilding.
That branch must contain these deployment files. Use separate checkouts; never
switch the STAGING checkout to a feature branch.

## Private configuration

Run after the deployment files exist in each checkout. These commands create new
files: run once only; do not overwrite existing credentials on redeploy.

```bash
cd /srv/shopnest/dev
test ! -e .env.dev && (umask 077; cp .env.dev.example .env.dev)
nano .env.dev
cd /srv/shopnest/staging
test ! -e .env.staging && (umask 077; cp .env.staging.example .env.staging)
nano .env.staging
```

Generate independent DB passwords with `openssl rand -hex 32` and payment keys
with `openssl rand -base64 32`; put them in the corresponding DEV_* or STAGING_*
fields. Never reuse credentials or commit private files. Empty fields deliberately
fail validation. Existing shell variables override Compose env files, so unset
DEV_DB_PASSWORD, DEV_PAYMENT_ENCRYPTION_KEY, STAGING_DB_PASSWORD and
STAGING_PAYMENT_ENCRYPTION_KEY if your shell already defines them. Also unset
COMPOSE_PROJECT_NAME; always use the exact standalone commands below.

Compose pins DB host, role and database and clears DATABASE_URL to prevent an
inherited URL redirecting the application to another database. NODE_ENV stays
production for secure cookies; APP_ENV identifies the deployment. Cardcom
production-mode settings and adapter calls are rejected in these environments.
Only use Cardcom-issued test credentials; the existing read-only credential check
does not itself turn a real credential into a sandbox credential. Payment creation,
verification and activation remain disabled. No credentials belong in NEXT_PUBLIC_*.
Optional Google OAuth must use a test client and each exact environment callback.

## Build and initialize each empty database

The dedicated Dockerfile runs npm ci, npm run build and npm start as a non-root
runtime user. Build uses a synthetic connection, without private env files.
Public image validation is compiled for JPEG/PNG/WebP up to 5 MiB.
The existing local npm run dev and default Compose workflow remain available.

```bash
cd /srv/shopnest/dev
docker compose --env-file .env.dev -f docker-compose.dev.yml config --quiet
docker compose --env-file .env.dev -f docker-compose.dev.yml build web
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --wait db
docker compose --env-file .env.dev -f docker-compose.dev.yml run --rm web npm run control-plane:migrate
docker compose --env-file .env.dev -f docker-compose.dev.yml run --rm web npm run tenant:create -- panda-pop
docker compose --env-file .env.dev -f docker-compose.dev.yml run --rm web npm run tenant:create -- dvorik-collection
docker compose --env-file .env.dev -f docker-compose.dev.yml run --rm web npm run tenant:create -- gift-shop
docker compose --env-file .env.dev -f docker-compose.dev.yml run --rm web npm run admin:create -- admin@example.com
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d

cd /srv/shopnest/staging
docker compose --env-file .env.staging -f docker-compose.staging.yml config --quiet
docker compose --env-file .env.staging -f docker-compose.staging.yml build web
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --wait db
docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm web npm run control-plane:migrate
docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm web npm run tenant:create -- panda-pop
docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm web npm run tenant:create -- dvorik-collection
docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm web npm run tenant:create -- gift-shop
docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm web npm run admin:create -- admin@example.com
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
```

Replace admin@example.com with the intended test administrator and enter a separate
password at each prompt. Follow [admin authentication](admin-authentication.md) for
tenant registry/status and assignments. Use /gift-shop and /shopnest/admin/login for
smoke checks; legacy root storefront tables are not provisioned by tenant:create.
Do not run db:push into public as a substitute for tenant migrations.

## Lifecycle commands

DEV:
```bash
cd /srv/shopnest/dev
# Start
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d
# Stop, retaining both volumes
docker compose --env-file .env.dev -f docker-compose.dev.yml down
# Rebuild selected feature revision and restart
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --build
# Logs
docker compose --env-file .env.dev -f docker-compose.dev.yml logs --tail=200 -f web db
```

STAGING:
```bash
cd /srv/shopnest/staging
# Start
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
# Stop, retaining both volumes
docker compose --env-file .env.staging -f docker-compose.staging.yml down
# Rebuild latest master and restart
git pull --ff-only origin master
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
# Logs
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --tail=200 -f web db
```

Before revisions with migrations: back up only the target environment, stop its
web service, build, run the control-plane and tenant migration commands above, then
start web. Never use down -v or volume prune for routine stopping/rebuilding.
Changing POSTGRES_PASSWORD in an env file does not rotate an initialized DB role.

## Host Nginx and TLS

One host Nginx owns 80/443. If the old Compose Nginx already owns them, arrange an
explicit maintenance migration preserving its existing routes before proceeding.
The old docker-compose.prod.yml also uses 3002: resolve that conflict before
starting STAGING. Do not stop existing services blindly.

For initial issuance, add temporary HTTP virtual hosts to the existing host Nginx
using this config in /etc/nginx/conf.d/shopnest-acme.conf:

```nginx
server {
    listen 80;
    server_name dev.shopnest.co.il staging.shopnest.co.il;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 404; }
}
```

Then:
```bash
sudo mkdir -p /var/www/letsencrypt
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d dev.shopnest.co.il
sudo certbot certonly --webroot -w /var/www/letsencrypt -d staging.shopnest.co.il
sudo install -m 644 /srv/shopnest/dev/nginx/dev.conf /etc/nginx/conf.d/shopnest-dev.conf
sudo install -m 644 /srv/shopnest/staging/nginx/staging.conf /etc/nginx/conf.d/shopnest-staging.conf
sudo rm /etc/nginx/conf.d/shopnest-acme.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Configure certificate renewal to reload Nginx after successful renewal.
The proxy supplies fixed environment hosts and HTTPS scheme; tenant routing still
comes from the validated URL path. No client-selected schema headers are generated.

## Verification on server

```bash
cd /srv/shopnest/dev
node --test tests/deployment.test.mjs
docker compose --env-file .env.dev -f docker-compose.dev.yml exec web node --test tests/payment-db.test.mjs
docker compose --env-file .env.dev -f docker-compose.dev.yml ps
docker compose --env-file .env.dev -f docker-compose.dev.yml exec db psql -U shopnest_dev -d shopnest_dev -c 'select current_database();'
cd /srv/shopnest/staging
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
docker compose --env-file .env.staging -f docker-compose.staging.yml exec db psql -U shopnest_staging -d shopnest_staging -c 'select current_database();'
docker inspect shopnest-dev-web shopnest-staging-web --format '{{.Name}} {{json .Mounts}}'
docker inspect shopnest-dev-db shopnest-staging-db --format '{{.Name}} {{json .Mounts}}'
curl -I https://dev.shopnest.co.il/shopnest/admin/login
curl -I https://staging.shopnest.co.il/shopnest/admin/login
```

Verify a synthetic product/upload created in DEV is absent in STAGING, and a DEV
login does not authenticate STAGING. Repeat tenant cross-access tests within each
environment. Confirm unknown tenants return 404 and tenant/schema spoof headers
cannot select another tenant. This requires live containers, DNS and TLS.
