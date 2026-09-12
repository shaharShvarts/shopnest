# DEV deployment

Run commands from the repository checkout at `/srv/shopnest/dev`. Use Docker
Compose v2 and `docker-compose.dev.yml`. The services are `web-dev`, `db-dev`,
and `nginx-dev`.

`nginx-dev` mounts the tracked root file `nginx.dev.conf` read-only at
`/etc/nginx/nginx.conf` and proxies to `web-dev:3000` on the DEV network.
The root `nginx.conf` is for the separate Compose stack whose service is named
`web`; it is not the DEV configuration. The DEV bind mount disables automatic
host-path creation, so a missing config fails instead of becoming a directory.
The old Docker-created directory `/srv/shopnest/dev/nginx/dev.conf` is no longer
used and does not need to be removed to deploy this fix.

Keep the existing `.env.dev` on the server. It must provide `DEV_DB_PASSWORD`
and `DEV_PAYMENT_ENCRYPTION_KEY`, alongside the application's other runtime
variables. Do not commit it or paste its contents into logs or PRs. Git and
Docker ignore env files so they are not committed or copied into the image.

Compose reads `.env.dev` for interpolation through `--env-file` and supplies it
to `web-dev` at runtime through `env_file`. Explicit environment values configure
the web service with host `db-dev`, port `5432`, user `shopnest`, database `shopnest`, and
password from `DEV_DB_PASSWORD`. The payment encryption key is mapped from
`DEV_PAYMENT_ENCRYPTION_KEY` to the application's `PAYMENT_ENCRYPTION_KEY`.
Postgres uses the same user, database, and password. Separate `DB_USER`,
`DB_PASSWORD`, or `DB_NAME` interpolation variables are not required.

The web image builds from the repository root using `Dockerfile`. Runtime
`env_file` values are not Docker build arguments.

The production `npm run build` imports route modules during page data collection,
including `/api/payments/[id]/callback`. Its payment-store dependency imports the
database module. Database URL resolution and client creation are deferred until
runtime database access, so building requires no DB credentials or payment keys.
Missing runtime DB configuration still throws; tenant schema checks and payment
verification remain mandatory. Do not pass real secrets as Docker build arguments
or add them to Dockerfile `ENV` instructions.

To validate the production image independently of runtime secrets:

```sh
docker build --no-cache -f Dockerfile -t shopnest-dev:build-check .
```

Validate the resolved configuration without printing secrets:

```sh
cd /srv/shopnest/dev
docker compose --env-file .env.dev -f docker-compose.dev.yml config > /dev/null
```

This runs `docker compose --env-file .env.dev -f docker-compose.dev.yml config`
while suppressing its resolved output, which contains secrets. For routine
validation, `config --quiet` is also available.

Build and start DEV, then inspect the services:

```sh
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --build db-dev web-dev nginx-dev
docker compose --env-file .env.dev -f docker-compose.dev.yml ps db-dev web-dev nginx-dev
docker compose --env-file .env.dev -f docker-compose.dev.yml logs --tail=100 web-dev db-dev nginx-dev
```

After pulling the updated branch, verify the file, start the upstream services,
and test nginx before recreating its container:

```sh
cd /srv/shopnest/dev
test -f nginx.dev.conf
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d db-dev web-dev
docker compose --env-file .env.dev -f docker-compose.dev.yml run --rm --no-deps nginx-dev nginx -t
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --no-deps --force-recreate nginx-dev
docker compose --env-file .env.dev -f docker-compose.dev.yml exec nginx-dev nginx -t
docker compose --env-file .env.dev -f docker-compose.dev.yml ps nginx-dev
curl -I http://127.0.0.1:8080/
```

The upstream `web-dev` container must be running on the DEV network for nginx
to resolve its service name. Confirm nginx stays running and HTTP requests
reach the app (an application redirect is normal; a `502` is not).

Review logs locally before sharing them. To restart the web service after
rebuilding, use `up -d --build web-dev`; to apply changed runtime variables,
use `up -d --force-recreate web-dev`, with the same Compose flags above.

The existing `pgdata-dev` volume is retained. Postgres initialization variables
only initialize an empty data directory; they do not rename an existing database
or reset its user's password. Existing data must already match these credentials.
Do not delete the volume to apply this configuration change.
