import { getDomainOwnershipClaimService } from "../src/lib/domain-claims/server.ts";

const merchantId = Number(process.argv[2]);
const storeId = Number(process.argv[3]);
const hostname = process.argv[4];

if (!Number.isInteger(merchantId) || merchantId <= 0 ||
    !Number.isInteger(storeId) || storeId <= 0 ||
    !hostname) {
  console.error("Usage: npm run domain-claim:verify -- <merchant-id> <store-id> <hostname>");
  process.exit(2);
}

const result = await getDomainOwnershipClaimService().verifyClaim(
  merchantId,
  storeId,
  hostname
);

console.log("kind:", result.kind);
if ("hostname" in result) console.log("hostname:", result.hostname);
if (result.kind === "verified") {
  console.log("verified_at:", result.verifiedAt.toISOString());
  process.exit(0);
}

process.exit(result.kind === "pending" ? 1 : 2);
