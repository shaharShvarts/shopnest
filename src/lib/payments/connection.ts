import "server-only";
import { z } from "zod";
import { resolveSettingsCredentials } from "./settings.ts";
import { PaymentError, type PaymentSettings } from "./types.ts";

export type ConnectionState = {
  success: boolean;
  message: "connectionSuccess" | "connectionFailed" | "connectionNotConfigured";
};
const connectionInput = z.object({
  provider: z.string().max(32),
  environment: z.enum(["test", "production"]),
  credentials: z.record(z.string().max(32), z.string().max(256)),
}).strict();

// Called only after admin authorization. This read-only boundary never saves settings.
export async function testSettingsConnection(
  input: unknown,
  previous: PaymentSettings | null,
  tenant: string,
  run = async (resolved: ReturnType<typeof resolveSettingsCredentials>) => {
    const adapter = resolved.provider.createAdapter(resolved.credentials, resolved.context.environment);
    return adapter.testConnection ? adapter.testConnection() : false;
  },
): Promise<ConnectionState> {
  try {
    const parsed = connectionInput.safeParse(input);
    if (!parsed.success) return { success: false, message: "connectionNotConfigured" };
    const resolved = resolveSettingsCredentials({ ...parsed.data, enabled: false }, previous, tenant);
    if (!resolved.provider.capabilities.testConnection) return { success: false, message: "connectionNotConfigured" };
    const success = await run(resolved);
    return { success, message: success ? "connectionSuccess" : "connectionFailed" };
  } catch (error) {
    return { success: false, message: error instanceof PaymentError && error.code === "invalid_credentials" ? "connectionNotConfigured" : "connectionFailed" };
  }
}
