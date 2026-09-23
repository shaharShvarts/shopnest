import { loadProjectEnv } from "./lib/load-project-env.mjs";

loadProjectEnv();

const actions = new Set([
  "start-claim",
  "check-txt",
  "check-cname",
  "check-provider",
  "remove",
  "show",
]);

function parseArgs(argv: string[]) {
  const allowed = new Set(["--store-id", "--hostname", "--action"]);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key || !allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(
        "Usage: npm run domain-lifecycle:smoke -- --store-id <id> --action <action> [--hostname <hostname>]"
      );
    }
    if (values.has(key)) {
      throw new Error("Duplicate smoke argument: " + key);
    }
    values.set(key, value);
  }

  const storeId = Number(values.get("--store-id"));
  const action = values.get("--action") ?? "";
  const hostname = values.get("--hostname") ?? null;

  if (!Number.isInteger(storeId) || storeId <= 0 || !actions.has(action)) {
    throw new Error("Invalid --store-id or --action");
  }

  if (
    ["start-claim", "check-txt", "check-cname", "remove"].includes(action) &&
    !hostname
  ) {
    throw new Error("--hostname is required for this action");
  }

  return { storeId, action, hostname };
}

async function resolveSingleOwnerMerchantId(storeId: number) {
  const [
    { and, eq, isNull },
    { getControlPlaneDb },
    { organizationMemberships, stores },
  ] = await Promise.all([
    import("drizzle-orm"),
    import("../src/drizzle/control-db.ts"),
    import("../src/drizzle/control-plane-schema.ts"),
  ]);

  const owners = await getControlPlaneDb()
    .select({
      merchantId: organizationMemberships.merchantAccountId,
    })
    .from(stores)
    .innerJoin(
      organizationMemberships,
      eq(
        organizationMemberships.organizationId,
        stores.organizationId
      )
    )
    .where(
      and(
        eq(stores.id, storeId),
        isNull(stores.deletedAt),
        eq(organizationMemberships.role, "owner")
      )
    )
    .limit(2);

  if (owners.length !== 1) {
    throw new Error(
      "Smoke helper requires exactly one owner for the Store"
    );
  }

  return owners[0]!.merchantId;
}

try {
  const input = parseArgs(process.argv.slice(2));
  const merchantId = await resolveSingleOwnerMerchantId(input.storeId);

  const [
    { getDomainOwnershipClaimService },
    { getCloudflareDomainProvisioningService },
    { getCustomDomainLifecycleService },
    { getCloudflareDomainRemovalService },
    { getMerchantDomainView },
  ] = await Promise.all([
    import("../src/lib/domain-claims/server.ts"),
    import("../src/lib/cloudflare-saas/domain-provisioning-server.ts"),
    import("../src/lib/custom-domain-lifecycle/server.ts"),
    import("../src/lib/cloudflare-saas/domain-removal-server.ts"),
    import("../src/lib/merchant-domains/server.ts"),
  ]);

  let result: unknown;

  switch (input.action) {
    case "start-claim":
      result = await getDomainOwnershipClaimService().startClaim(
        merchantId,
        input.storeId,
        input.hostname
      );
      break;

    case "check-txt":
      result = await getDomainOwnershipClaimService().verifyClaim(
        merchantId,
        input.storeId,
        input.hostname
      );
      break;

    case "check-cname": {
      const verified =
        await getDomainOwnershipClaimService().verifyCname(
          merchantId,
          input.storeId,
          input.hostname
        );

      if (verified.kind === "verified") {
        result =
          await getCloudflareDomainProvisioningService()
            .provisionVerifiedClaim(
              merchantId,
              input.storeId,
              input.hostname
            );
      } else {
        result = verified;
      }
      break;
    }

    case "check-provider":
      result =
        await getCustomDomainLifecycleService().checkOwnedCandidate(
          merchantId,
          input.storeId
        );
      break;

    case "remove": {
      const view = await getMerchantDomainView(
        merchantId,
        input.storeId
      );
      const primary = view?.currentPrimary?.hostname;
      if (!primary || primary !== input.hostname) {
        throw new Error(
          "--hostname must exactly match the current primary domain"
        );
      }
      result =
        await getCloudflareDomainRemovalService().removeOwnedDomain(
          merchantId,
          input.storeId,
          primary
        );
      break;
    }

    case "show":
      result = await getMerchantDomainView(
        merchantId,
        input.storeId
      );
      break;
  }

  console.log(
    JSON.stringify(
      result,
      (_key, value) =>
        value instanceof Date ? value.toISOString() : value,
      2
    )
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Domain lifecycle smoke action failed"
  );
  process.exitCode = 1;
}
