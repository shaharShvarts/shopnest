import {
  readCloudflareSaasConfig,
  isCloudflareCustomHostnameReady,
} from "../src/lib/cloudflare-saas/core.ts";
import { CloudflareSaasClient } from "../src/lib/cloudflare-saas/client.ts";

const hostname = process.argv[2];

if (!hostname) {
  console.error("Usage: npm run cloudflare-saas:smoke -- <hostname>");
  process.exit(2);
}

const config = readCloudflareSaasConfig();

if (!config.enabled) {
  console.error("Cloudflare SaaS integration is disabled.");
  process.exit(2);
}

const client = new CloudflareSaasClient({
  apiToken: config.apiToken,
  zoneId: config.zoneId,
});

const matches = await client.findCustomHostnameByHostname(hostname);

if (matches.length === 0) {
  console.error(`Cloudflare custom hostname not found: ${hostname}`);
  process.exit(1);
}

if (matches.length !== 1) {
  console.error(
    `Expected exactly one Cloudflare custom hostname for ${hostname}; found ${matches.length}`
  );
  process.exit(1);
}

const result = matches[0];

console.log("hostname:", result.hostname);
console.log("id:", result.id);
console.log("status:", result.status);
console.log("ssl_status:", result.sslStatus ?? "unknown");
console.log("ready:", isCloudflareCustomHostnameReady(result));

if (result.hostname !== hostname || !isCloudflareCustomHostnameReady(result)) {
  process.exit(1);
}
