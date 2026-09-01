import { pgEnum } from "drizzle-orm/pg-core";

export const adminRoles = ["super_admin", "tenant_admin"] as const;
export type AdminRole = (typeof adminRoles)[number];
export const adminRoleEnum = pgEnum("admin_role", adminRoles);

export const tenantStatuses = ["active", "suspended", "disabled"] as const;
export type TenantStatus = (typeof tenantStatuses)[number];
export const tenantStatusEnum = pgEnum("tenant_status", tenantStatuses);

export const customerStatuses = ["active", "disabled"] as const;
export type CustomerStatus = (typeof customerStatuses)[number];
export const customerStatusEnum = pgEnum("customer_status", customerStatuses);

export const customerAuthProviders = ["password", "google", "apple"] as const;
export type CustomerAuthProvider = (typeof customerAuthProviders)[number];
export const customerAuthProviderEnum = pgEnum(
  "customer_auth_provider",
  customerAuthProviders
);
