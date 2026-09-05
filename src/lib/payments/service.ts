import "server-only";
import { z } from "zod";
import type { Tenant } from "@/lib/tenant";
import { getProvider } from "./registry";
import { decryptCredentials } from "./encryption";
import { confirmPayment, startPayment, type AdapterResolver } from "./core";
import { DrizzlePaymentStore } from "./drizzle-store";
import { PaymentError } from "./types";

function adapterResolver(tenant: Tenant): AdapterResolver {
  return (settings) => {
    const definition = getProvider(settings.provider);
    if (!definition.live) throw new PaymentError("not_implemented");
    if (!definition.environments.includes(settings.environment))
      throw new PaymentError("invalid_environment");
    const credentials = decryptCredentials(settings.encryptedCredentials, {
      tenant: tenant.slug,
      provider: settings.provider,
      environment: settings.environment,
    });
    return definition.createAdapter(
      definition.validateCredentials(credentials),
      settings.environment,
    );
  };
}

export function beginOrderPayment(
  tenant: Tenant,
  orderId: number,
  ownerKey: string,
) {
  const origin = process.env.PAYMENT_PUBLIC_ORIGIN;
  if (!origin) throw new PaymentError("not_configured");
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new PaymentError("not_configured");
  return startPayment(
    new DrizzlePaymentStore(tenant),
    { orderId, ownerKey, publicOrigin: url.origin, basePath: tenant.basePath },
    adapterResolver(tenant),
  );
}

export async function processPaymentCallback(
  tenant: Tenant,
  id: string,
  body: string,
  headers: Headers,
) {
  if (!z.string().uuid().safeParse(id).success || body.length > 65536)
    throw new PaymentError("invalid_callback");
  return confirmPayment(
    new DrizzlePaymentStore(tenant),
    id,
    { body, headers },
    adapterResolver(tenant),
  );
}
