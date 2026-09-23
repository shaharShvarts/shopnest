import { getCloudflareDomainSyncService } from "../src/lib/cloudflare-saas/domain-sync-server.ts";
import { canonicalCloudflareHostname } from "../src/lib/cloudflare-saas/core.ts";

const input = process.argv[2];
const hostname = canonicalCloudflareHostname(input);

if (!input || !hostname || hostname !== input) {
  console.error(
    "Usage: npm run cloudflare-domain-sync:smoke -- <canonical-hostname>"
  );
  process.exit(2);
}

const result = await getCloudflareDomainSyncService().syncByHostname(hostname);

console.log("kind:", result.kind);

if (result.kind === "not_found") {
  console.error("ShopNest store_domains row not found.");
  process.exit(1);
}

if (result.kind === "not_managed") {
  console.error("ShopNest domain is not Cloudflare-managed.");
  process.exit(1);
}

console.log("hostname:", result.hostname);
console.log("provider_hostname_status:", result.providerHostnameStatus);
console.log("provider_ssl_status:", result.providerSslStatus ?? "unknown");
console.log("ready:", result.ready);
console.log("domain_status:", result.domainStatus);

if (!result.ready || result.domainStatus !== "active") {
  process.exit(1);
}
