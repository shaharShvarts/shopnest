export type AdminAccountRole = "super_admin" | "tenant_admin";

export type AdminProvisioningClient = {
  query(
    sql: string,
    parameters?: unknown[]
  ): Promise<{ rows: Array<{ id: number }> }>;
};

export function provisionAdminAccount(
  client: AdminProvisioningClient,
  input: {
    email: string;
    passwordHash: string;
    role: AdminAccountRole;
    tenantSlugs: string[];
  }
): Promise<number>;
