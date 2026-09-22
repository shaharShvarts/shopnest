# ShopNest Cloudflare Custom-Domain Automation Design

Date: 2026-09-22
Status: Proposed implementation baseline
Repository: shaharShvarts/shopnest
Target branch: feature/cloudflare-custom-domain-automation
Base: master after merged PR #45
Base commit: d3b09015c38dce294e076ca778b4a71ba451c220

## 1. Purpose

Automate the lifecycle between ShopNest `public.store_domains` and Cloudflare for SaaS while preserving the trusted Host -> store_domains -> Tenant routing introduced in PR #45.

The first release is intentionally constrained to Cloudflare Free-compatible capabilities.

This PR owns:
- Cloudflare for SaaS custom-hostname API integration
- merchant-owned custom-domain request lifecycle
- Cloudflare custom-hostname creation
- Cloudflare status synchronization
- customer DNS instructions
- activation only after Cloudflare hostname and SSL readiness
- removal/deactivation synchronization
- Free-plan quota guard
- idempotency, retries, and safe failure handling
- DEV/STAGING provider tests with mocked Cloudflare by default
- optional manual sandbox acceptance against the real Cloudflare account

This PR does not purchase domains, change registrar nameservers, or depend on paid Cloudflare features.

## 2. Cloudflare Free constraints

ShopNest must remain compatible with the Cloudflare Free plan.

Initial hard constraints:
- Cloudflare for SaaS standard fallback-origin model only
- exact custom hostnames only
- no wildcard custom hostnames
- no Apex Proxying
- no BYOIP
- no custom uploaded certificates
- no Workers for Platforms dependency
- no paid WAF dependency
- no automatic plan upgrade
- no create operation when the configured Free hostname allowance would be exceeded

Cloudflare for SaaS currently includes 100 custom hostnames on Free/Pro/Business plans. ShopNest must fail closed before creating a hostname that would exceed the configured free allowance. The default application cap is 100 and may only be raised by an explicit operator configuration change.

Because Cloudflare may contain custom hostnames not created by ShopNest, quota checks use both:
1. ShopNest-owned active/pending Cloudflare bindings in the control plane.
2. Cloudflare's current custom-hostname list/count before create.

A PostgreSQL advisory lock serializes ShopNest custom-hostname creation so concurrent requests cannot independently pass the quota check.

## 3. Provider topology

Provider zone:
- `shopnest.co.il`

One-time operator setup in Cloudflare:
1. Enable Cloudflare for SaaS.
2. Create a proxied fallback-origin DNS record in the ShopNest zone.
3. Configure that record as the Cloudflare for SaaS fallback origin.
4. Create a stable proxied CNAME target such as:
   - `customers.shopnest.co.il`
5. Point the CNAME target to the fallback origin.
6. Keep ShopNest origin/Nginx able to receive the original customer Host header.

Customer DNS flow:
- merchant chooses a custom hostname such as `shop.customer.com`
- ShopNest creates a Cloudflare Custom Hostname
- ShopNest instructs the merchant to create:
  `shop.customer.com CNAME customers.shopnest.co.il`
- Cloudflare validates and provisions TLS
- ShopNest marks the domain routable only after Cloudflare reports both hostname and SSL active

The provider fallback origin and CNAME target are infrastructure configuration. The application does not mutate them during normal merchant requests.

## 4. Authentication and API token

Use a scoped Cloudflare API Token, never the Global API Key.

Initial token scope:
- resource: only the ShopNest provider zone
- permission: SSL and Certificates Write

Do not grant DNS Write for this PR because normal merchant onboarding does not modify the ShopNest provider zone's DNS records. Fallback-origin/CNAME-target setup remains an operator action.

Environment configuration:
- `CLOUDFLARE_SAAS_ENABLED`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_SAAS_CNAME_TARGET`
- `CLOUDFLARE_SAAS_FREE_HOSTNAME_LIMIT` default `100`

Secrets:
- API token exists only in runtime secret/environment configuration.
- never store the token in PostgreSQL.
- never return it to the browser.
- never log it.
- redact authorization headers in provider errors.

## 5. Supported hostname shape

PR #45 already provides canonical hostname validation.

For this first automation release:
- exact non-wildcard hostnames only
- localhost/IP/platform hosts rejected
- no hostname equal to the provider zone
- no wildcard
- no apex-domain automation

The merchant-facing flow should recommend a subdomain such as:
- `www.customer.com`
- `shop.customer.com`
- `store.customer.com`

Apex support is deferred because Cloudflare Apex Proxying is not part of the Free-compatible scope.

## 6. Cloudflare custom-hostname creation

ShopNest creates a Custom Hostname using the provider zone.

Initial SSL configuration:
- certificate type: DV
- validation method: HTTP
- no wildcard
- no custom certificate
- no custom origin per merchant; use the configured fallback origin

Reason for HTTP validation:
- simplest customer workflow
- merchant normally creates one CNAME to the ShopNest SaaS target
- Cloudflare can complete HTTP DCV after the hostname points to the SaaS target

Tradeoff:
- a new hostname may briefly point to Cloudflare before its dedicated certificate reaches active.
- zero-downtime migration/pre-validation is deferred to a later enhancement using TXT/DCV where needed.

## 7. Source-of-truth model

ShopNest remains authoritative for merchant ownership and Tenant binding.

Cloudflare is authoritative for:
- Cloudflare custom-hostname identifier
- hostname activation state
- SSL/certificate state
- provider validation/error details

A Cloudflare success response never selects a Tenant. Tenant identity continues to come from trusted ShopNest control-plane data.

## 8. Store-domain persistence

Extend `public.store_domains` additively with provider metadata.

Suggested fields:
- `provider` default `cloudflare`
- `provider_hostname_id` nullable
- `provider_hostname_status` nullable
- `provider_ssl_status` nullable
- `provider_last_synced_at` nullable
- `provider_last_error_code` nullable
- `provider_last_error_at` nullable
- `activation_requested_at` nullable

Do not store:
- API tokens
- raw Authorization headers
- full unbounded provider error payloads
- certificates/private keys

Provider IDs are unique when non-null.

Existing `status` remains the ShopNest routing state:
- `pending_verification`
- `verified`
- `active`
- `failed`
- `removed`

Provider state does not directly bypass ShopNest lifecycle validation.

## 9. Lifecycle

### Request

Merchant submits a canonical hostname for a Store they own.

Server:
1. authenticate merchant
2. verify organization/store ownership
3. require Store/Tenant eligibility
4. normalize hostname
5. reject platform/local/wildcard/apex unsupported input
6. enforce hostname uniqueness
7. create/update ShopNest `store_domains` row as `pending_verification`
8. do not make it routable yet

### Provision at Cloudflare

Server:
1. acquire ShopNest Cloudflare provisioning advisory lock
2. re-read domain row
3. enforce idempotency
4. verify Free hostname quota
5. create Cloudflare Custom Hostname if no provider ID exists
6. persist provider ID/status
7. return DNS instructions to merchant

Repeated requests must not create duplicate Cloudflare custom hostnames.

### DNS setup

Merchant creates:
`<custom-hostname> CNAME <CLOUDFLARE_SAAS_CNAME_TARGET>`

ShopNest UI displays:
- hostname
- exact CNAME target
- current hostname status
- current SSL status
- last checked time
- retry/check action

### Synchronize

Server calls Custom Hostname Details.

Ready for ShopNest activation only when:
- Cloudflare hostname status == `active`
- Cloudflare ssl.status == `active`
- ShopNest Tenant is active
- ShopNest domain row still belongs to that Tenant
- hostname remains canonical and exact

Then transactionally:
- set `verified_at` if absent
- set ShopNest domain status = `active`
- persist provider states
- clear domain-registry cache for the hostname

If either Cloudflare readiness state is not active:
- keep ShopNest status non-routable
- persist bounded provider state
- do not expose the custom hostname through trusted routing

### Remove

Merchant/operator removal:
1. authorize ownership
2. mark ShopNest row non-routable first
3. clear domain cache
4. call Cloudflare delete when a provider ID exists
5. persist `removed`
6. Cloudflare deletion failure is retryable and never re-enables routing

Delete at Cloudflare also removes associated certificates, so UI requires explicit confirmation.

## 10. Failure behavior

All provider failures fail closed.

Examples:
- Cloudflare unavailable -> keep domain non-routable
- malformed provider response -> fail, do not activate
- provider ID mismatch -> fail
- provider hostname mismatch -> fail
- status active but SSL not active -> do not activate
- SSL active but hostname not active -> do not activate
- Tenant inactive -> do not activate
- quota reached -> reject create before provider mutation
- timeout after create with uncertain result -> reconcile by exact hostname before retrying create
- delete timeout -> keep ShopNest non-routable and retry provider cleanup later

Do not translate a Cloudflare error into another Tenant/domain.

## 11. Idempotency and reconciliation

Provider create is an external side effect, so retry logic must account for ambiguous network failures.

Before creating:
- check persisted provider ID
- query Cloudflare for exact hostname when recovering from an uncertain prior attempt

After create:
- persist provider ID immediately in the control-plane transaction following the successful API response

Reconciliation rules:
- exact hostname is the external idempotency key
- never adopt a Cloudflare hostname whose hostname differs from the requested canonical hostname
- provider object must belong to the configured ShopNest zone
- duplicate provider objects require operator review rather than guessing

## 12. API client boundary

Introduce a small provider abstraction rather than calling `fetch` from route handlers.

Conceptual interface:
- `listCustomHostnames()`
- `findCustomHostnameByHostname(hostname)`
- `createCustomHostname(hostname)`
- `getCustomHostname(id)`
- `deleteCustomHostname(id)`

Cloudflare adapter responsibilities:
- base URL and auth
- timeouts
- response shape validation
- error normalization
- secret-safe logging
- bounded response sizes
- no implicit retries for non-idempotent create without reconciliation

Business/service layer responsibilities:
- authorization
- quota
- ShopNest lifecycle
- Tenant binding
- transactions/locks
- idempotency
- cache invalidation

## 13. Merchant UI

Use the existing merchant dashboard route family.

Initial page:
- `/dashboard/domain`

States:
- no domain
- pending DNS setup
- provisioning
- active
- failed/retryable
- removed

UI must not claim the domain is live based only on browser DNS checks.

Server/provider status is authoritative.

The page shows:
- requested hostname
- CNAME target
- hostname status
- SSL status
- retry/check button
- remove action
- clear explanation that initial Free-compatible release supports subdomains, not apex domains

## 14. Free-plan guard

Application configuration default:
`CLOUDFLARE_SAAS_FREE_HOSTNAME_LIMIT=100`

Before every create:
1. acquire advisory lock
2. count local provider-bound non-removed domains
3. list/count Cloudflare custom hostnames
4. use the higher observed count for safety
5. if count >= configured limit, reject create

No automatic billing action.

The cap may only be changed by operator configuration after an explicit business decision.

## 15. Security invariants

- API token never reaches browser, DB, Git, or logs
- token scoped only to required provider zone/permission
- browser hostname never becomes schema
- Cloudflare hostname never becomes schema
- provider state never becomes tenant authorization
- merchant ownership is checked before create/check/remove
- hostname uniqueness enforced in PostgreSQL
- provider ID uniqueness enforced in PostgreSQL
- domain does not route until ShopNest status is active
- ShopNest status does not become active until hostname + SSL are active
- unknown/malformed provider state fails closed
- quota check is server-side
- no wildcard or apex paid-feature fallback
- no client-supplied provider ID
- no client-supplied provider status
- no client-supplied Tenant/schema identifiers

## 16. Migration

Add one additive journaled control-plane migration for Cloudflare/provider metadata on `public.store_domains`.

Requirements:
- no destructive reset
- hash/idempotency compatible with existing control-plane provisioner
- DEV migration against current DB
- STAGING migration against current DB
- existing active/removed domain rows remain valid
- new provider metadata nullable for legacy/manual rows

## 17. Testing

Automated tests:
- provider response validation
- Cloudflare errors are normalized without secrets
- create request uses configured zone and DV/HTTP SSL only
- wildcard rejected
- unsupported apex input rejected
- provider hostname mismatch rejected
- active hostname + active SSL -> ShopNest active
- hostname active + SSL pending -> non-routable
- SSL active + hostname pending -> non-routable
- inactive Tenant -> non-routable
- create idempotency
- ambiguous-create reconciliation
- quota cap at configured limit
- quota race serialized by advisory lock/service lock
- delete marks ShopNest non-routable before provider cleanup
- provider delete failure remains non-routable/retryable
- cache invalidation after activation/removal
- merchant cannot mutate another Store's domain
- browser cannot provide provider IDs/status
- existing trusted-host routing tests remain green

DEV acceptance:
- migration
- mocked Cloudflare lifecycle
- domain remains 404 before provider readiness
- activation after simulated hostname+SSL active
- removal returns 404
- no tenant/schema mutation

STAGING acceptance:
- same non-destructive mocked lifecycle
- optional real Cloudflare custom-hostname acceptance only after operator config is present and the test hostname is explicitly approved

## 18. Operator setup checklist

Before real Cloudflare acceptance:
- confirm `shopnest.co.il` zone is on Free
- enable Cloudflare for SaaS
- confirm billing/payment requirement in Cloudflare UI without changing plan
- configure proxied fallback origin
- configure stable CNAME target
- verify fallback origin status Active
- create least-privilege API token scoped to ShopNest zone
- install token only in DEV/STAGING secret environment as appropriate
- verify application Free hostname limit is 100 or lower
- never paste the API token into chat, Git, SQL, screenshots, or logs

## 19. Out of scope

- domain purchase/registration
- registrar API
- nameserver automation
- apex proxying
- wildcard custom hostnames
- Workers for Platforms
- paid Cloudflare plan upgrade
- custom uploaded TLS certificates
- BYOIP
- per-merchant custom origins
- automated DNS changes in customer-owned zones
- automatic billing
- production rollout before DEV/STAGING acceptance

## 20. Acceptance gate

Do not merge until:
- implementation tests pass
- final CI passes
- DEV migration + acceptance pass
- STAGING migration + acceptance pass
- security review confirms token/tenant boundaries
- Free-plan cap is enforced
- user explicitly approves merge


## Merchant DNS cleanup guidance

After a custom domain has completed the full activation flow and ShopNest has confirmed both the Cloudflare custom hostname and SSL are active, the merchant UI should explicitly tell the store owner that the temporary ShopNest ownership-verification TXT record is no longer required.

Suggested merchant-facing copy:

> Ownership verification is complete. You can now remove the ShopNest TXT verification record from your DNS.

This guidance must not be shown immediately after TXT ownership verification. It should only appear after the custom domain is fully active. ShopNest does not attempt to delete the merchant's DNS record itself.
