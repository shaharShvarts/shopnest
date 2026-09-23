import { loadProjectEnv } from "./lib/load-project-env.mjs";

loadProjectEnv();

function parseArgs(argv: string[]) {
  const allowed = new Set(["--tenant-slug", "--restore-hostname"]);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key || !allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(
        "Usage: npm run domain:rollback -- --tenant-slug <slug> --restore-hostname <hostname>"
      );
    }
    if (values.has(key)) {
      throw new Error("Duplicate rollback argument: " + key);
    }
    values.set(key, value);
  }

  if (values.size !== 2) {
    throw new Error(
      "Usage: npm run domain:rollback -- --tenant-slug <slug> --restore-hostname <hostname>"
    );
  }

  return {
    tenantSlug: values.get("--tenant-slug")!,
    restoreHostname: values.get("--restore-hostname")!,
  };
}

try {
  const input = parseArgs(process.argv.slice(2));
  const [{ validateClaimHostname }, { rollbackRetiringDomainForAdmin }] =
    await Promise.all([
      import("../src/lib/domain-claims/core.ts"),
      import("../src/lib/custom-domain-lifecycle/server.ts"),
    ]);

  const restoreHostname = validateClaimHostname(
    input.restoreHostname
  );

  const result = await rollbackRetiringDomainForAdmin(
    input.tenantSlug,
    restoreHostname,
    new Date()
  );

  console.log("restored_hostname:", result.restoredHostname);
  console.log("retiring_hostname:", result.retiringHostname);
  console.log("retirement_window_hours: 24");
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Custom-domain rollback failed"
  );
  process.exitCode = 1;
}
