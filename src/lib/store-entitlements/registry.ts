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
] as const satisfies readonly SupportedEntitlementDefinition[];

export type SupportedEntitlementCode =
  (typeof SUPPORTED_ENTITLEMENTS)[number]["code"];

export function supportedEntitlementByCode(code: string) {
  return SUPPORTED_ENTITLEMENTS.find((item) => item.code === code) ?? null;
}
