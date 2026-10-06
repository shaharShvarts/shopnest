import { and, asc, eq, isNull } from "drizzle-orm";
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
  isActive: shippingMethods.isActive,
  price: shippingMethods.price,
  requiresAddress: shippingMethods.requiresAddress,
  sortOrder: shippingMethods.sortOrder,
  logoUrl: shippingMethods.logoUrl,
};

export class DrizzleShippingMethodStore implements ShippingMethodStore {
  constructor(private readonly database: TenantDatabase | TenantTransaction) {}

  listActive() {
    return this.database
      .select(selection)
      .from(shippingMethods)
      .where(
        and(
          eq(shippingMethods.isActive, true),
          isNull(shippingMethods.deletedAt)
        )
      )
      .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.name));
  }

  async findActiveById(id: number) {
    const [method] = await this.database
      .select(selection)
      .from(shippingMethods)
      .where(
        and(
          eq(shippingMethods.id, id),
          eq(shippingMethods.isActive, true),
          isNull(shippingMethods.deletedAt)
        )
      )
      .limit(1);
    return method ?? null;
  }
}
