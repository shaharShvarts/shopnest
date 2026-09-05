"use server";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { revalidateTenantPath } from "@/lib/tenant-context";
import { DrizzlePaymentStore } from "@/lib/payments/drizzle-store";

export type PaymentSettingsState = {
  success: boolean;
  message: "saved" | "saveFailed" | "";
};
export async function savePaymentSettings(
  _previous: PaymentSettingsState,
  input: unknown,
): Promise<PaymentSettingsState> {
  // Authorize before parsing or reading settings; input has no tenant/schema field.
  const { tenant } = await requireTenantAdminDb();
  try {
    await new DrizzlePaymentStore(tenant).saveSettings(input);
  } catch {
    // No SQL/validation/provider error (or submitted value) leaves the server.
    return { success: false, message: "saveFailed" };
  }
  await revalidateTenantPath("/admin/payments");
  return { success: true, message: "saved" };
}

export async function testPaymentConnection(input: unknown): Promise<import("@/lib/payments/connection").ConnectionState> {
  const { tenant } = await requireTenantAdminDb();
  try {
    return await new DrizzlePaymentStore(tenant).testConnection(input);
  } catch {
    return { success: false, message: "connectionFailed" };
  }
}
