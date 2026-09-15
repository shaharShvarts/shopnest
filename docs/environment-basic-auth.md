# DEV and STAGING HTTP Basic Authentication

DEV and STAGING are protected at the Docker Nginx layer before requests reach Next.js.
Credentials are stored only in local `.htpasswd` files and are never committed.
Use separate credentials for DEV and STAGING.

## Create credentials

On the Linux host, install the helper once if needed:

```bash
sudo apt-get update
sudo apt-get install -y apache2-utils
```

Create credentials interactively so the password is not written in shell history:

```bash
cd /srv/shopnest/dev
htpasswd -c .htpasswd.dev shopnest
chmod 644 .htpasswd.dev
```

For STAGING:

```bash
cd /srv/shopnest/staging
htpasswd -c .htpasswd.staging shopnest
chmod 644 .htpasswd.staging
```

The Docker Nginx worker must be able to read the bind-mounted file. Mode `600` on a host-owned file can cause `open() /etc/nginx/.htpasswd failed (13: Permission denied)` and return HTTP 500 after valid credentials. The file contains a password hash, not the plaintext password, and remains ignored by Git.

The two passwords should be different. The `.htpasswd*` files are ignored by Git.

## DEV

DEV mounts `.htpasswd.dev` read-only at `/etc/nginx/.htpasswd` and protects the entire Nginx server with the realm `ShopNest DEV`.

DEV uploads are also persisted through the host bind mount:

```text
/srv/shopnest/dev/uploads -> /app/uploads
```

The application uses `SHOPNEST_UPLOADS_DIR=/app/uploads`. Rebuilding or recreating `web-dev` must not remove files stored under the host `uploads` directory.

Apply configuration:

```bash
cd /srv/shopnest/dev
docker compose --env-file .env.dev -f docker-compose.dev.yml config >/dev/null
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --build web-dev nginx-dev
```

Verify the Nginx configuration:

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml exec nginx-dev nginx -t
```

An unauthenticated request through Nginx should return `401`:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
```

After entering the configured username/password in a browser, DEV should load normally.

## STAGING

STAGING mounts `.htpasswd.staging` read-only at `/etc/nginx/.htpasswd` and protects the entire Nginx server with the realm `ShopNest STAGING`.

Apply configuration from the STAGING checkout:

```bash
cd /srv/shopnest/staging
docker compose -p shopnest-staging --env-file .env.staging -f docker-compose.staging.yml config >/dev/null
docker compose -p shopnest-staging --env-file .env.staging -f docker-compose.staging.yml up -d --build nginx-staging
```

Verify:

```bash
docker compose -p shopnest-staging --env-file .env.staging -f docker-compose.staging.yml exec nginx-staging nginx -t
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/
```

The unauthenticated request should return `401`. Public HTTPS requests routed by the host Nginx to `127.0.0.1:8081` will receive the same browser Basic Auth challenge.

## Safety notes

- Never commit `.htpasswd.dev`, `.htpasswd.staging`, plaintext passwords, or password hashes.
- Keep DEV and STAGING credentials separate.
- Basic Auth protects the environment entry point; it does not replace ShopNest admin/customer authentication or tenant authorization.
- Do not enable production payment credentials or production Cardcom processing in DEV/STAGING.
