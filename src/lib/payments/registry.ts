import "server-only";
import { cardcomAdapter } from "./providers/cardcom-connection.ts";
import { z } from "zod";
import { metadata as cardcom, credentialsSchema } from "./providers/cardcom.ts";
import { unavailableProvider } from "./providers/unavailable.ts";
import {
  PaymentError,
  type ProviderMetadata,
  type PaymentProvider,
  type PaymentEnvironment,
} from "./types.ts";

export type ProviderDefinition = ProviderMetadata & {
  validateCredentials(input: unknown): Record<string, string>;
  createAdapter(
    credentials: Record<string, string>,
    environment: PaymentEnvironment,
  ): PaymentProvider;
};

const emptyCredentials = z.object({}).strict();
function definition(
  metadata: ProviderMetadata,
  schema: z.ZodType<Record<string, string>>,
): ProviderDefinition {
  return {
    ...metadata,
    validateCredentials(input) {
      const result = schema.safeParse(input);
      if (!result.success) throw new PaymentError("invalid_credentials");
      return result.data;
    },
    createAdapter: unavailableProvider,
  };
}

export const providerRegistry: readonly ProviderDefinition[] = [
  { ...definition(cardcom, credentialsSchema), createAdapter: cardcomAdapter },
  ...(["pelecard", "tranzila"] as const).map((id) =>
    definition(
      {
        id,
        displayName: id === "pelecard" ? "Pelecard" : "Tranzila",
        // No credential or environment contract is claimed before official validation.
        environments: ["production"],
        fields: [],
        live: false,
        capabilities: {
          hostedPayment: false,
          verification: false,
          testConnection: false,
        },
      },
      emptyCredentials,
    ),
  ),
];

export function getProvider(id: unknown): ProviderDefinition {
  const provider = providerRegistry.find((entry) => entry.id === id);
  if (!provider) throw new PaymentError("unknown_provider");
  return provider;
}

// Explicit allowlist, never pass factories, validators or credentials to React.
export function providerMetadata(): ProviderMetadata[] {
  return providerRegistry.map(
    ({ id, displayName, environments, fields, live, capabilities }) => ({
      id,
      displayName,
      environments,
      fields,
      live,
      capabilities,
    }),
  );
}
