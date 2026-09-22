import { getCloudflareDomainProvisioningService } from "../src/lib/cloudflare-saas/domain-provisioning-server.ts";
const merchantId = Number(process.argv[2]);
const storeId = Number(process.argv[3]);
const hostname = process.argv[4];

if (
  !Number.isInteger(merchantId) ||
  merchantId <= 0 ||
  !Number.isInteger(storeId) ||
  storeId <= 0 ||
  !hostname
) {
  console.error(
    "Usage: npm run cloudflare-domain-provision:smoke -- <merchant-id> <store-id> <hostname>"
  );
  process.exit(2);
}

try {
  const result =
    await getCloudflareDomainProvisioningService().provisionVerifiedClaim(
      merchantId,
      storeId,
      hostname
    );

  console.log("kind:", result.kind);
  console.log("hostname:", result.hostname);

  if (result.kind === "provisioned") {
    console.log("provider_hostname_id:", result.providerHostnameId);
    console.log(
      "provider_hostname_status:",
      result.providerHostnameStatus
    );
    console.log(
      "provider_ssl_status:",
      result.providerSslStatus ?? "unknown"
    );
    console.log("cname_target:", result.cnameTarget);
  }
} catch (error) {
  if (
    error instanceof Error &&
    error.name === "CloudflareDomainProvisioningError" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    console.log("blocked: true");
    console.log("code:", error.code);
    console.log("message:", error.message);
    process.exit(3);
  }

  throw error;
}
