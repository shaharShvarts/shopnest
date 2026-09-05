import { z } from "zod";
import type { ProviderMetadata } from "../types.ts";

// Only read-only credential validation is available; payments remain disabled.
export const metadata: ProviderMetadata = {
  id: "cardcom",
  displayName: "Cardcom",
  environments: ["test", "production"],
  live: false,
  capabilities: {
    hostedPayment: false,
    verification: false,
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
