import { pgEnum } from "drizzle-orm/pg-core";

export const adminRoles = ["super_admin", "tenant_admin"] as const;
export type AdminRole = (typeof adminRoles)[number];
export const adminRoleEnum = pgEnum("admin_role", adminRoles);

export const tenantStatuses = ["active", "suspended", "disabled"] as const;
export type TenantStatus = (typeof tenantStatuses)[number];
export const tenantStatusEnum = pgEnum("tenant_status", tenantStatuses);

export const tenantPlans = ["small", "medium", "large"] as const;
export type TenantPlan = (typeof tenantPlans)[number];
export const tenantPlanEnum = pgEnum("tenant_plan", tenantPlans);

export const customerStatuses = ["active", "disabled"] as const;
export type CustomerStatus = (typeof customerStatuses)[number];
export const customerStatusEnum = pgEnum("customer_status", customerStatuses);

export const customerAuthProviders = ["password", "google", "apple"] as const;
export type CustomerAuthProvider = (typeof customerAuthProviders)[number];
export const customerAuthProviderEnum = pgEnum(
  "customer_auth_provider",
  customerAuthProviders
);

export const merchantStatuses = ["active", "disabled"] as const;
export type MerchantStatus = (typeof merchantStatuses)[number];
export const merchantStatusEnum = pgEnum("merchant_status", merchantStatuses);

export const storeStatuses = [
  "draft",
  "ready_for_provisioning",
  "provisioned",
] as const;
export type StoreStatus = (typeof storeStatuses)[number];
export const storeStatusEnum = pgEnum("store_status", storeStatuses);


export const planStatuses = ["active", "inactive"] as const;
export type PlanStatus = (typeof planStatuses)[number];
export const planStatusEnum = pgEnum("plan_status", planStatuses);

export const subscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export const subscriptionStatusEnum = pgEnum(
  "subscription_status",
  subscriptionStatuses
);
