import { and, asc, eq } from "drizzle-orm";
import type { getDbForTenant } from "@/drizzle/db";
import { shippingMethods } from "@/drizzle/schema";
import type { ShippingMethodStore } from "./core";

type TenantDatabase = ReturnType<typeof getDbForTenant>;
type TenantTransaction = Parameters<
  Parameters<TenantDatabase["transaction"]>[0]
>[0];

const selection = {
  id: shippingMethods.id,
  name: shippingMethods.name,
  code: shippingMethods.code,
  type: shippingMethods.type,
  isActive: shippingMethods.isActive,
  price: shippingMethods.price,
  freeShippingThreshold: shippingMethods.freeShippingThreshold,
  sortOrder: shippingMethods.sortOrder,
};

export class DrizzleShippingMethodStore implements ShippingMethodStore {
  constructor(private readonly database: TenantDatabase | TenantTransaction) {}

  listActive() {
    return this.database
      .select(selection)
      .from(shippingMethods)
      .where(eq(shippingMethods.isActive, true))
      .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.name));
  }

  async findActiveById(id: number) {
    const [method] = await this.database
      .select(selection)
      .from(shippingMethods)
      .where(
        and(eq(shippingMethods.id, id), eq(shippingMethods.isActive, true))
      )
      .limit(1);
    return method ?? null;
  }
}
