# DEV/STAGING nginx request-flood hardening

ShopNest DEV and STAGING sit behind Cloudflare and the host nginx reverse proxy.

Cloudflare remains the primary per-client rate-limiting and DDoS layer. The
container nginx configuration adds a second, origin-side safety net against
large aggregate request floods and slow-client resource exhaustion.

## Origin-side limits

Both `nginx.dev.conf` and `nginx.staging.conf` apply:

- a global per-environment request ceiling of 200 requests/second with a burst
  allowance of 400 requests;
- a global per-environment concurrent connection ceiling of 200;
- HTTP 429 responses when either origin-side ceiling is exceeded;
- short client header/body timeouts and timed-out connection resets;
- bounded keep-alive lifetime and request count;
- 5 second upstream connect timeout and 60 second upstream send/read timeouts;
- a 6 MiB request-body ceiling, leaving multipart headroom above the
  application's 5 MiB upload limit.

These limits intentionally use `$server_name`, not `$remote_addr`. The
container receives requests through host nginx, so `$remote_addr` identifies
that reverse proxy rather than a trustworthy end-client identity. Per-client
rate limiting therefore stays at the Cloudflare edge.

## Acceptance

After deploying a changed nginx configuration:

1. Run `nginx -t` inside the environment nginx container.
2. Confirm the loaded configuration with `nginx -T`.
3. Verify the environment homepage and tenant storefront load.
4. Verify Basic Auth still protects DEV/STAGING.
5. Verify admin, customer login, Google OAuth, and checkout still work.
6. Confirm normal browsing does not return HTTP 429.
7. Review Cloudflare and nginx logs for unexpected blocks before tightening
   limits.

Do not use these origin-side ceilings as a replacement for Cloudflare or for
application-level authorization, idempotency, or payment protections.
