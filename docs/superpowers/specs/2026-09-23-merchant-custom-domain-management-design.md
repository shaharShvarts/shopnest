# ShopNest Merchant Custom-Domain Management Design

Date: 2026-09-23
Status: Approved design baseline
Repository: shaharShvarts/shopnest
Target branch: feature/merchant-custom-domain-management
Base: master after merged PR #46
Base commit: 52469077dfd4bc6199e6eefef4e566340699aa63

## 1. Purpose

Add the merchant-facing custom-domain lifecycle on top of the Cloudflare for SaaS foundation delivered by PR #46.

The merchant flow must be safe, explicit, and zero-downtime for an existing store. A merchant can:
- connect the first custom subdomain for a Store
- see exact DNS instructions and progress
- verify ownership manually
- verify the required CNAME manually
- provision the Cloudflare Custom Hostname only after both DNS prerequisites are correct
- manually check Cloudflare hostname/SSL readiness
- replace an active custom domain without interrupting the current domain
- remove a custom domain and immediately fall back to the ShopNest slug URL

This design deliberately has no background worker, cron job, or automatic polling. Every external DNS/provider check is initiated by a user action, with server-enforced cooldowns.

## 2. Merchant route and authorization

Merchant page:

`/dashboard/stores/[id]/domain`

The page is always scoped to one Store.

Server rules:
- authenticate the merchant
- authorize Store ownership from control-plane relationships
- derive Tenant from the owned Store
- never trust browser-supplied Tenant ID, schema, provider ID, provider status, lifecycle role, or routing state
- never derive a database schema from Host or domain input

The merchant may submit only user-owned inputs such as the requested hostname and an action intent. All authoritative relationships are re-read server-side.

## 3. Product constraints

Initial release:
- exact subdomains only
- no apex domains
- no wildcard domains
- direct CNAME only
- one normal active custom domain per Store
- a second domain is allowed only transiently for replacement
- Cloudflare Free-compatible only
- Medium and Large plans retain the existing custom-domain entitlement
- current ShopNest/active custom domain must keep working until a replacement is fully ready

Stable ShopNest CNAME target:

`customers.shopnest.co.il`

The required customer CNAME must point directly to this target. ShopNest does not accept or follow an intermediate CNAME chain as satisfying the setup check.

## 4. Data model

### 4.1 `store_domain_claims`

This table owns the pre-Cloudflare onboarding state.

It remains the source of truth for ownership verification and should be extended to support the merchant flow.

Required state/data:
- Store ID
- canonical hostname
- claim status
- SHA-256 ownership token hash
- expiration timestamp
- TXT verified timestamp
- CNAME verified timestamp
- last manual TXT check timestamp
- last manual CNAME check timestamp
- consumed timestamp
- created/updated timestamps

The plaintext TXT token is returned only when a claim is created or reissued. It is never stored.

Claim lifetime:
- 24 hours

If a claim expires before ownership verification completes:
- mark it expired
- do not change routing
- do not create a Cloudflare Custom Hostname
- allow the merchant to create a new verification token

A claim that is abandoned before Cloudflare provisioning has no effect on the current domain.

### 4.2 `store_domains`

`store_domains` remains the authoritative set of domains that have crossed the DNS preflight boundary and may have a Cloudflare provider resource.

A row is created only after:
1. TXT ownership verification succeeded.
2. The hostname has a direct CNAME to `customers.shopnest.co.il`.

The legacy `verification_token` field in `store_domains` should be removed from the logical model because ownership tokens belong only to `store_domain_claims`. The implementation plan must choose a migration-safe way to retire it without destructive reset behavior.

Add a lifecycle role/state that distinguishes:
- `candidate` — Cloudflare resource exists or is being provisioned, but it is not yet the Store's active custom domain.
- `primary` — current active custom domain.
- `retiring` — previous primary during a 24-hour redirect/rollback window.
- `removed` — locally non-routable and eligible for provider cleanup/retry.

Required replacement metadata:
- `cname_verified_at`
- `last_manual_check_at`
- `retire_at`
- `redirect_to_domain_id` nullable self-reference

Existing provider metadata remains:
- provider
- provider hostname ID
- provider hostname status
- provider SSL status
- last synced time
- bounded provider error code/time
- activation request time

Constraints must enforce:
- hostname globally unique while bound
- at most one primary custom domain per Tenant/Store
- at most one candidate replacement per Tenant/Store
- provider hostname ID unique when present
- redirect target must not point to self
- removed domains are never considered routable

## 5. Merchant UX

The custom-domain page should explain the process before asking the merchant to make DNS changes.

Required guidance:
- DNS records are created at the merchant's registrar or DNS provider.
- ShopNest does not modify the merchant's DNS.
- DNS propagation can take minutes or hours.
- the current store address remains active throughout setup
- if setup is not completed for any reason, no action is required; the current domain continues to work
- during replacement, the current custom domain stays active until the new domain is fully ready

Because DNS providers label fields differently, the UI must show both:
- the full record name/hostname
- a note that some DNS providers expect only the relative host label

Example progress presentation:

1. Verify ownership
2. Verify CNAME
3. Provision domain and SSL
4. Active

Each step shows a clear status badge, exact action required, and the last check result.

## 6. Step 1 — ownership TXT

Merchant enters a custom hostname, for example:

`shop.example.com`

Server:
1. authorizes Store ownership
2. verifies plan/Store eligibility
3. canonicalizes hostname
4. rejects platform hosts, IPs, localhost, wildcard, apex, and invalid values
5. verifies the hostname is not already bound elsewhere
6. creates a 24-hour claim
7. generates a 32-byte random token
8. stores only SHA-256(token)
9. returns the TXT instruction

TXT instruction:

- Type: TXT
- Name: `_shopnest-verification.<hostname>`
- Value: `shopnest-verification=<token>`

UI provides copy controls for Name and Value and shows the 24-hour expiration countdown.

### Manual TXT check

The merchant presses **Check now**.

The server performs a real DNS TXT lookup.

Outcomes:
- correct TXT -> mark claim verified and unlock CNAME step
- record absent/wrong/not propagated -> keep pending and show a friendly retry message
- claim expired -> mark expired and offer **Create new verification code**

Cooldown:
- one real TXT lookup per claim per 60 seconds
- enforce on the server
- disable the button in the UI during cooldown
- show a countdown until the next allowed real check
- do not fake a lookup
- a repeated request inside cooldown returns the last known result and next allowed check time

## 7. Step 2 — direct CNAME preflight

After TXT ownership verification, the UI shows:

`<hostname> CNAME customers.shopnest.co.il`

The merchant creates the record at their DNS provider and presses **Check CNAME**.

ShopNest performs DNS resolution only. At this point there is still no Cloudflare Custom Hostname.

Success requires:
- the requested hostname has a CNAME
- its direct canonical target is exactly `customers.shopnest.co.il`

Do not treat an indirect alias chain as valid for this release.

Cooldown:
- one real CNAME lookup per claim per 60 seconds
- server-enforced
- UI button disabled with countdown
- repeated requests inside cooldown return the last result rather than issuing another DNS query

When CNAME verification succeeds:
- persist `cname_verified_at`
- immediately run server-side provisioning preflight
- enforce entitlement and Cloudflare Free quota
- create/reserve the `store_domains` candidate
- create the Cloudflare Custom Hostname
- consume the claim after the provider binding is safely persisted

No Cloudflare quota is consumed before both TXT and CNAME preflight succeed.

## 8. Step 3 — Cloudflare provisioning and SSL

After Cloudflare creation, the page switches to a provisioning state and shows:
- CNAME verified
- Cloudflare hostname status
- SSL status
- last checked time
- **Check status** button

There is no worker and no polling.

Each user-triggered check:
1. authorizes Store ownership
2. re-reads the candidate and Store/Tenant state
3. calls Cloudflare for exact provider state
4. persists bounded provider status
5. activates only if hostname status == `active` and SSL status == `active`
6. otherwise remains non-routable

The manual Cloudflare status check also has a server-enforced 60-second cooldown and disabled-button countdown in the UI.

If the provider is temporarily unavailable, keep the candidate non-routable and show a retryable message.

## 9. First-domain activation

When a Store has no active custom domain and its candidate becomes Cloudflare-ready:

Transactionally:
- re-check merchant ownership and Store/Tenant validity
- re-check candidate still belongs to this Store/Tenant
- re-check Cloudflare readiness from the current request
- set candidate lifecycle role to `primary`
- mark routing state active
- clear relevant domain-registry cache
- make the ShopNest slug URL redirect to the custom domain

Platform URL behavior after activation:

`shopnest.co.il/<slug>` -> HTTP 302 -> active custom domain

Use 302 initially so the behavior remains reversible while the feature matures.

## 10. Replacement flow

A Store with an existing primary may start a new claim for a replacement hostname.

Before cutover:
- old domain remains `primary`
- new verified/provisioned domain remains `candidate`
- old domain continues serving normally
- ShopNest slug continues redirecting to the old primary
- if the merchant abandons the process, nothing changes

When the merchant manually checks status and the candidate is fully Cloudflare-ready, perform the cutover transactionally:

- candidate -> `primary`
- old primary -> `retiring`
- old `retire_at = now + 24 hours`
- old `redirect_to_domain_id = new primary`
- ShopNest slug redirect target changes to the new primary
- clear routing caches for both hostnames

During the 24-hour retirement window:
- new primary serves the Store
- old custom domain returns HTTP 302 to the new primary
- rollback is available only to ShopNest Admin/Operator
- Merchant cannot rollback

## 11. Admin rollback

Rollback is allowed only while the previous primary is still inside its retirement window.

Primary interface:
- Super Admin UI

Fallback interface:
- operator CLI/server-side command

Rollback is symmetric:
- retiring old domain becomes `primary`
- current primary becomes `retiring`
- new retiring domain receives `retire_at = now + 24 hours`
- new retiring domain 302 redirects to the restored primary
- ShopNest slug redirect switches back to the restored primary
- relevant caches are cleared

This preserves service for users who may already have visited or bookmarked the newer domain.

Merchant UI does not expose rollback.

## 12. Retirement and lazy cleanup

There is no background worker.

Expired retirement is cleaned lazily on relevant server-side domain activity, such as:
- opening the merchant domain page
- manual domain status check
- merchant domain removal action
- Admin domain management action
- other server-side domain-management entry points that naturally load lifecycle state

When `retire_at <= now`:
1. mark the retiring domain locally non-routable first
2. clear routing cache
3. attempt Cloudflare Custom Hostname deletion
4. if delete succeeds or Cloudflare says it is already absent, finalize provider cleanup
5. if provider cleanup fails, keep local routing disabled and record a retryable provider error
6. retry provider cleanup on a later relevant domain-management action

Cloudflare cleanup failure must never restore routing.

## 13. Merchant removal without replacement

If the merchant removes the current custom domain without replacing it:

1. authorize Store ownership
2. mark custom domain locally non-routable first
3. clear domain routing cache
4. immediately stop redirecting the ShopNest slug URL
5. `shopnest.co.il/<slug>` immediately serves the Store normally
6. then attempt provider deletion
7. provider failure remains retryable and does not re-enable the custom domain

This guarantees the Store remains reachable even if Cloudflare deletion fails.

## 14. Trusted routing behavior

Existing trusted Host routing remains fail-closed.

A Host never selects a schema directly.

Routing rules:
- `primary` + active provider-ready domain -> route to its trusted Tenant
- `candidate` -> never routable
- `retiring` inside retirement window -> 302 only to its stored primary target; do not render the Store directly
- `removed` -> not routable
- unknown hostname -> existing fail-closed behavior
- inactive Tenant -> not routable

The redirect target must be resolved from trusted control-plane relationships, not from an arbitrary browser URL.

## 15. Cooldown model

Manual checks exist for:
- TXT
- CNAME
- Cloudflare status

All use a 60-second server-side minimum interval.

Server responses should include enough state for UI countdown:
- last real check timestamp
- next allowed real check timestamp
- last result/status

A page refresh, second browser tab, or direct action request must not bypass cooldown.

The client countdown is UX only. The server timestamp is authoritative.

## 16. Error handling

Merchant-facing errors should be actionable and non-destructive.

Examples:
- TXT not visible yet -> keep pending; ask merchant to retry later
- TXT claim expired -> offer new verification code
- CNAME missing/wrong -> keep current domain unchanged
- CNAME propagated to wrong target -> explain expected direct target
- Cloudflare still provisioning -> keep candidate non-routable
- Cloudflare unavailable -> preserve current routing, record safe error
- quota exhausted -> do not create provider resource
- hostname already bound -> reject before provider mutation
- Store/Tenant no longer eligible -> fail closed
- provider ID or hostname mismatch -> fail closed
- concurrent cutover/removal -> serialize/lock and re-read authoritative state

Never expose raw provider responses, secrets, authorization headers, or unbounded error bodies.

## 17. Security invariants

- Store ownership checked on every merchant action
- Admin rollback uses existing ShopNest admin authorization, not merchant authorization
- browser does not choose Tenant, schema, provider ID, provider status, lifecycle role, redirect target, or retirement timestamp
- plaintext ownership token is never persisted
- hostname canonicalization and uniqueness are server-side
- no provider create before TXT + direct CNAME verification
- provider state cannot authorize Tenant access
- candidate is never routable
- old domain is non-routable before destructive provider cleanup
- Host never derives database schema
- active routing requires trusted control-plane binding
- all cross-Store attempts fail closed

## 18. DNS cleanup guidance

After the custom domain is fully active, the UI may tell the merchant:

> Ownership verification is complete. You can now remove the ShopNest TXT verification record from your DNS.

Do not show this immediately after TXT verification. Show it only after the custom domain is fully active.

The CNAME must remain in place for the custom domain to continue working.

## 19. UI states

The page should support these merchant-visible states:
- no custom domain
- ownership pending
- ownership verified / CNAME pending
- CNAME verified / provider provisioning
- SSL pending
- active
- replacing active domain
- replacement candidate provisioning
- active with old domain retiring
- claim expired
- retryable provider error
- custom domain removed / platform URL active

The currently active Store address should always be visible during setup/replacement so the merchant knows the Store remains online.

## 20. Migration approach

Use additive control-plane migrations only.

Expected migration work:
- extend `store_domain_claims` with CNAME/check timestamps
- extend `store_domains` with lifecycle and retirement/redirect metadata
- adjust unique/check indexes for one primary + one transient candidate
- migrate existing active custom domains to `primary`
- preserve existing provider IDs/status
- retire the legacy domain verification token safely
- no destructive database reset
- apply and validate on DEV before STAGING

Migration logic must preserve existing accepted custom-domain records from PR #46.

## 21. Testing

Automated coverage must include at least:

Claims and DNS:
- claim creation
- 24-hour expiry
- reissue after expiry
- token hash only
- TXT success/failure
- TXT 60-second cooldown
- CNAME exact-target success
- wrong/missing/indirect CNAME failure
- CNAME 60-second cooldown
- no provider create before TXT + CNAME succeed

Provisioning:
- provider quota enforcement
- create idempotency/reconciliation retained from PR #46
- provider status 60-second cooldown
- hostname active + SSL active -> eligible for activation
- partial provider readiness -> candidate remains non-routable

Activation/routing:
- first domain becomes primary
- ShopNest slug 302 redirects to primary
- candidate Host cannot route
- replacement keeps old primary active before cutover
- transactional replacement cutover
- old domain 302 to new during retirement
- platform slug redirects to new primary after cutover
- inactive/unknown/mismatched Tenant fails closed

Removal/retirement:
- remove primary -> platform slug serves Store immediately
- local deactivation happens before provider delete
- provider delete failure never restores routing
- lazy cleanup after retirement expiry
- Cloudflare 404 during cleanup finalizes local cleanup

Rollback:
- Admin-only rollback inside 24-hour window
- Merchant rollback rejected
- rollback swaps primary/retiring roles safely
- newer domain 302s to restored old primary for a new 24-hour retirement window

Isolation/concurrency:
- merchant cannot manage another Store's domain
- duplicate hostname rejected
- one primary per Store/Tenant
- one candidate per Store/Tenant
- concurrent cutover serialized
- concurrent remove/cutover cannot create two primaries
- browser-supplied provider/Tenant/schema/lifecycle values ignored or rejected

## 22. Acceptance

DEV:
- control-plane migration passes
- all automated tests pass
- merchant page flow works end-to-end against DEV
- TXT cooldown/countdown verified
- CNAME cooldown/countdown verified
- Cloudflare status cooldown/countdown verified
- first activation verified
- replacement verified without downtime
- retiring 302 verified
- removal restores slug route immediately
- unknown Host remains fail-closed

STAGING:
- migration passes
- existing staging custom-domain data remains valid
- end-to-end merchant flow with explicitly approved test hostname
- replacement/rollback/removal acceptance
- no cross-environment routing regression

Do not merge until:
- implementation tests pass
- production build passes
- final CI passes
- DEV acceptance passes
- STAGING acceptance passes
- security review confirms Store/Tenant isolation
- user explicitly approves merge

## 23. Out of scope

- background worker
- cron-based reconciliation
- automatic polling
- domain purchase/registration
- registrar APIs
- automatic DNS changes
- apex domains
- wildcard custom domains
- multiple simultaneous active aliases
- paid Cloudflare features
- production fallback-origin topology redesign
- permanent 301 redirects
- merchant self-service rollback
- automatic Cloudflare plan/billing changes
