import "server-only";
import { z } from "zod";
import { getProvider } from "./registry.ts";
import { decryptCredentials, encryptCredentials } from "./encryption.ts";
import { PaymentError, type PaymentSettings } from "./types.ts";

const inputSchema = z
  .object({
    provider: z.string().max(32),
    environment: z.enum(["test", "production"]),
    enabled: z.boolean(),
    credentials: z.record(z.string().max(32), z.string().max(256)),
  })
  .strict();

export function prepareSettings(
  input: unknown,
  previous: PaymentSettings | null,
  tenant: string,
): PaymentSettings {
  const result = inputSchema.safeParse(input);
  if (!result.success) throw new PaymentError("invalid_settings");
  const data = result.data;
  const provider = getProvider(data.provider);
  if (!provider.environments.includes(data.environment))
    throw new PaymentError("invalid_environment");
  if (data.enabled && !provider.live) throw new PaymentError("not_implemented");
  const context = {
    tenant,
    provider: provider.id,
    environment: data.environment,
  };
  // Blank fields preserve existing values only for the same provider/environment.
  // Saved values are never sent to the client. Only this update boundary merges them.
  const saved =
    previous?.provider === provider.id &&
    previous.environment === data.environment
      ? decryptCredentials(previous.encryptedCredentials, context)
      : {};
  if (
    Object.keys(data.credentials).some(
      (name) => !provider.fields.some((field) => field.id === name),
    )
  )
    throw new PaymentError("invalid_credentials");
  const credentials = provider.validateCredentials(
    Object.fromEntries(
      provider.fields.map((field) => [
        field.id,
        data.credentials[field.id] || saved[field.id] || "",
      ]),
    ),
  );
  return {
    provider: provider.id,
    environment: data.environment,
    enabled: data.enabled,
    encryptedCredentials: encryptCredentials(credentials, context),
    configuredFields: Object.keys(credentials),
  };
}

export function settingsReadModel(settings: PaymentSettings | null) {
  if (!settings) return null;
  return {
    provider: settings.provider,
    environment: settings.environment,
    enabled: settings.enabled,
    configuredFields: getProvider(settings.provider)
      .fields.filter((field) => settings.configuredFields.includes(field.id))
      .map((field) => field.id),
  };
}
export type SettingsReadModel = ReturnType<typeof settingsReadModel>;
