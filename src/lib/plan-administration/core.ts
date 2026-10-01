import { z } from "zod";

export const planCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const planMutationSchema = z.object({
  planId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  status: z.enum(["active", "inactive"]),
  monthlyAmountMinor: z.number().int().nonnegative(),
  annualAmountMinor: z.number().int().nonnegative(),
  entitlementValues: z.record(
    z.string(),
    z.number().int().min(-1)
  ),
});

export const createPlanSchema = z.object({
  code: planCodeSchema,
  name: z.string().trim().min(1).max(160),
});

export const ilsPriceInputSchema = z
  .string()
  .trim()
  .min(1, "Price is required")
  .regex(/^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/, "Invalid ILS price");

export const planUpdateFormSchema = z.object({
  planId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  status: z.enum(["active", "inactive"]),
  monthlyPrice: ilsPriceInputSchema,
  annualPrice: ilsPriceInputSchema,
});

export function parseIlsToMinor(value: unknown) {
  const parsed = ilsPriceInputSchema.parse(value);
  const normalized = parsed.replace(",", ".");
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

export const addPlanEntitlementSchema = z.object({
  planId: z.coerce.number().int().positive(),
  entitlementCode: z.string().trim().min(1).max(64),
});

export const removePlanEntitlementSchema = z.object({
  planId: z.coerce.number().int().positive(),
  entitlementId: z.coerce.number().int().positive(),
});
