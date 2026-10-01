export type SupportedEntitlementDefinition = {
  code: string;
  name: string;
  description: string;
  valueType: "boolean" | "integer";
};

export const SUPPORTED_ENTITLEMENTS = [
  {
    code: "store_managers",
    name: "Store Managers",
    description: "Maximum number of Store Managers assigned to one Store.",
    valueType: "integer",
  },
  {
    code: "custom_domain",
    name: "Custom Domain",
    description: "Allow the Store to use its own custom domain.",
    valueType: "boolean",
  },
  {
    code: "media_storage_mb",
    name: "Media Storage",
    description: "Maximum media storage available to the Store, in megabytes.",
    valueType: "integer",
  },
  {
    code: "products_limit",
    name: "Products",
    description: "Maximum number of products allowed in the Store catalog.",
    valueType: "integer",
  },
] as const satisfies readonly SupportedEntitlementDefinition[];

export type SupportedEntitlementCode =
  (typeof SUPPORTED_ENTITLEMENTS)[number]["code"];

export function supportedEntitlementByCode(code: string) {
  return SUPPORTED_ENTITLEMENTS.find((item) => item.code === code) ?? null;
}
