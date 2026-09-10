import { z } from "zod";
import { PaymentError, type PaymentEnvironment, type ProviderMetadata } from "../types.ts";

// Only the official non-charging test terminal is supported. Production is blocked.
export const metadata: ProviderMetadata = {
  id: "cardcom",
  displayName: "Cardcom",
  environments: ["test", "production"],
  live: false,
  testPayments: true,
  capabilities: {
    hostedPayment: true,
    verification: true,
    testConnection: true,
  },
  fields: [
    {
      id: "terminalNumber",
      label: "terminalNumber",
      type: "text",
      secret: false,
      maxLength: 9,
    },
    {
      id: "apiName",
      label: "apiName",
      type: "password",
      secret: true,
      maxLength: 128,
    },
    { id: "apiPassword", label: "apiPassword", type: "password", secret: true, maxLength: 128 },
  ],
};
export const credentialsSchema = z
  .object({
    terminalNumber: z.string().regex(/^[1-9][0-9]{0,8}$/),
    apiName: z.string().trim().min(1).max(128),
    apiPassword: z.string().min(1).max(128).refine((value) => value.trim().length > 0),
  })
  .strict();

export function assertCardcomTestConfiguration(credentials: Record<string, string>, environment: PaymentEnvironment) {
  if (environment !== "test") throw new PaymentError("not_implemented");
  if (credentials.terminalNumber !== "1000") throw new PaymentError("cardcom_test_terminal_required");
}
