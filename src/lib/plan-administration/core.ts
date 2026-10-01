import { z } from "zod";

export const planCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const entitlementCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/);

export const planMutationSchema = z.object({
  planId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  status: z.enum(["active", "inactive"]),
  monthlyAmountMinor: z.number().int().nonnegative().nullable(),
  annualAmountMinor: z.number().int().nonnegative().nullable(),
  entitlementValues: z.record(
    z.string(),
    z.number().int().min(-1)
  ),
});

export const createPlanSchema = z.object({
  code: planCodeSchema,
  name: z.string().trim().min(1).max(160),
});

export const createEntitlementSchema = z.object({
  code: entitlementCodeSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable(),
  valueType: z.enum(["boolean", "integer"]),
});

export function parseIlsToMinor(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Invalid ILS amount");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const amount =
    Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Invalid ILS amount");
  }
  return amount;
}

export function formatMinorAmount(amountMinor: number | null) {
  if (amountMinor === null) return "";
  return (amountMinor / 100).toFixed(2);
}

export function validateEntitlementValue(
  valueType: "boolean" | "integer",
  value: number
) {
  if (!Number.isSafeInteger(value) || value < -1) {
    throw new Error("Invalid entitlement value");
  }
  if (valueType === "boolean" && value !== 0 && value !== 1) {
    throw new Error("Boolean entitlements must be 0 or 1");
  }
  return value;
}
