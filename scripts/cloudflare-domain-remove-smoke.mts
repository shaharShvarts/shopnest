import { getCloudflareDomainRemovalService } from "../src/lib/cloudflare-saas/domain-removal-server.ts";

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
    "Usage: npm run cloudflare-domain-remove:smoke -- <merchant-id> <store-id> <hostname>"
  );
  process.exit(2);
}

try {
  const result =
    await getCloudflareDomainRemovalService().removeOwnedDomain(
      merchantId,
      storeId,
      hostname
    );

  console.log("kind:", result.kind);
  console.log("hostname:", result.hostname);
} catch (error) {
  if (
    error instanceof Error &&
    error.name === "CloudflareDomainRemovalError" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    console.log("blocked: true");
    console.log("code:", error.code);
    console.log("message:", error.message);
    process.exit(3);
  }

  console.log("failed: true");
  console.log("code: DOMAIN_REMOVAL_FAILED");
  console.log("message: Domain removal failed and remains non-routable");
  process.exit(4);
}
