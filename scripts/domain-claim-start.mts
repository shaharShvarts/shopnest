import { getDomainOwnershipClaimService } from "../src/lib/domain-claims/server.ts";

const merchantId = Number(process.argv[2]);
const storeId = Number(process.argv[3]);
const hostname = process.argv[4];

if (!Number.isInteger(merchantId) || merchantId <= 0 ||
    !Number.isInteger(storeId) || storeId <= 0 ||
    !hostname) {
  console.error("Usage: npm run domain-claim:start -- <merchant-id> <store-id> <hostname>");
  process.exit(2);
}

const result = await getDomainOwnershipClaimService().startClaim(
  merchantId,
  storeId,
  hostname
);

console.log("claim_id:", result.claimId);
console.log("hostname:", result.hostname);
console.log("dns_type: TXT");
console.log("dns_name:", result.dnsName);
console.log("dns_value:", result.dnsValue);
console.log("expires_at:", result.expiresAt.toISOString());
