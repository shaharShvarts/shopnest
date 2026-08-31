import { and, asc, eq, isNull } from "drizzle-orm";
import type { getDbForTenant } from "@/drizzle/db";
import { categories, products, subcategories } from "@/drizzle/schema";
import type { StorefrontCatalogStore } from "./core";

type TenantDatabase = ReturnType<typeof getDbForTenant>;

const productPreviewSelection = {
  id: products.id,
  name: products.name,
  description: products.description,
  price: products.price,
  imageUrl: products.imageUrl,
};

export class DrizzleStorefrontCatalogStore implements StorefrontCatalogStore {
  constructor(private readonly database: TenantDatabase) {}

  async findVisibleCategory(categoryId: number) {
    const [category] = await this.database
      .select({
        id: categories.id,
        name: categories.name,
        imageUrl: categories.imageUrl,
      })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.isActive, true),
          isNull(categories.deletedAt)
        )
      )
      .limit(1);

    return category ?? null;
  }

  listVisibleSubcategories(categoryId: number) {
    return this.database
      .select({
        id: subcategories.id,
        name: subcategories.name,
        imageUrl: subcategories.imageUrl,
        categoryId: subcategories.categoryId,
      })
      .from(subcategories)
      .where(
        and(
          eq(subcategories.categoryId, categoryId),
          eq(subcategories.isActive, true),
          isNull(subcategories.deletedAt)
        )
      )
      .orderBy(asc(subcategories.name), asc(subcategories.id));
  }

  listVisibleDirectProducts(categoryId: number) {
    return this.database
      .select(productPreviewSelection)
      .from(products)
      .where(
        and(
          eq(products.categoryId, categoryId),
          isNull(products.subcategoryId),
          eq(products.isActive, true),
          eq(products.isAvailable, true),
          isNull(products.deletedAt)
        )
      )
      .orderBy(asc(products.name), asc(products.id));
  }

  async findVisibleSubcategory(categoryId: number, subcategoryId: number) {
    const [subcategory] = await this.database
      .select({
        id: subcategories.id,
        name: subcategories.name,
        imageUrl: subcategories.imageUrl,
        categoryId: subcategories.categoryId,
      })
      .from(subcategories)
      .where(
        and(
          eq(subcategories.id, subcategoryId),
          eq(subcategories.categoryId, categoryId),
          eq(subcategories.isActive, true),
          isNull(subcategories.deletedAt)
        )
      )
      .limit(1);

    return subcategory ?? null;
  }

  listVisibleSubcategoryProducts(
    categoryId: number,
    subcategoryId: number
  ) {
    return this.database
      .select(productPreviewSelection)
      .from(products)
      .where(
        and(
          eq(products.categoryId, categoryId),
          eq(products.subcategoryId, subcategoryId),
          eq(products.isActive, true),
          eq(products.isAvailable, true),
          isNull(products.deletedAt)
        )
      )
      .orderBy(asc(products.name), asc(products.id));
  }
}
