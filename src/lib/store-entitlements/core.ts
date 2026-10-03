export type EntitlementValueType = "boolean" | "integer";

export type EffectiveEntitlement = {
  code: string;
  name: string;
  description: string | null;
  valueType: EntitlementValueType;
  value: number;
};

export type EffectiveStoreEntitlements = {
  storeId: number;
  plan: {
    id: number;
    code: string;
    name: string;
  } | null;
  entitlements: ReadonlyMap<string, EffectiveEntitlement>;
};

export type StoreEntitlementRow = {
  storeId: number;
  planId: number | null;
  planCode: string | null;
  planName: string | null;
  entitlementCode: string | null;
  entitlementName: string | null;
  entitlementDescription: string | null;
  entitlementValueType: EntitlementValueType | null;
  entitlementValue: number | null;
};

export function effectiveStoreEntitlementsFromRows(
  storeId: number,
  rows: StoreEntitlementRow[]
): EffectiveStoreEntitlements {
  const firstPlanRow = rows.find((row) => row.planId !== null);
  const plan =
    firstPlanRow?.planId !== null &&
    firstPlanRow?.planCode &&
    firstPlanRow?.planName
      ? {
          id: firstPlanRow.planId,
          code: firstPlanRow.planCode,
          name: firstPlanRow.planName,
        }
      : null;

  const entitlements = new Map<string, EffectiveEntitlement>();

  for (const row of rows) {
    if (
      !row.entitlementCode ||
      !row.entitlementName ||
      !row.entitlementValueType ||
      row.entitlementValue === null
    ) {
      continue;
    }

    if (row.entitlementValue < -1) {
      throw new Error(
        `Invalid entitlement value for ${row.entitlementCode}`
      );
    }

    if (
      row.entitlementValueType === "boolean" &&
      row.entitlementValue !== 0 &&
      row.entitlementValue !== 1
    ) {
      throw new Error(
        `Invalid boolean entitlement value for ${row.entitlementCode}`
      );
    }

    entitlements.set(row.entitlementCode, {
      code: row.entitlementCode,
      name: row.entitlementName,
      description: row.entitlementDescription,
      valueType: row.entitlementValueType,
      value: row.entitlementValue,
    });
  }

  return {
    storeId,
    plan,
    entitlements,
  };
}

export function integerEntitlement(
  state: EffectiveStoreEntitlements,
  code: string
): number {
  const entitlement = state.entitlements.get(code);
  if (!entitlement) return 0;
  if (entitlement.valueType !== "integer") {
    throw new Error(`Entitlement ${code} is not integer-valued`);
  }
  return entitlement.value;
}

export function booleanEntitlement(
  state: EffectiveStoreEntitlements,
  code: string
): boolean {
  const entitlement = state.entitlements.get(code);
  if (!entitlement) return false;
  if (entitlement.valueType !== "boolean") {
    throw new Error(`Entitlement ${code} is not boolean-valued`);
  }
  return entitlement.value === 1;
}

export function entitlementIsUnlimited(value: number) {
  return value === -1;
}

export function entitlementHasCapacity(value: number, currentUsage: number) {
  if (!Number.isSafeInteger(currentUsage) || currentUsage < 0) {
    throw new Error("Entitlement usage must be a non-negative integer");
  }
  return value === -1 || currentUsage < value;
}
