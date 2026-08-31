import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import type { getDbForTenant } from "@/drizzle/db";
import { categories, products, subcategories } from "@/drizzle/schema";
import type { StorefrontSearchStore } from "./core";

type TenantDatabase = ReturnType<typeof getDbForTenant>;

function escapeLikePattern(query: string) {
  return query.replace(/[\\%_]/g, "\\$&");
}

export class DrizzleStorefrontSearchStore implements StorefrontSearchStore {
  constructor(private readonly database: TenantDatabase) {}

  searchVisibleProducts(query: string, limit: number) {
    const pattern = `%${escapeLikePattern(query)}%`;
    const nameMatches = sql<boolean>`${products.name} ilike ${pattern} escape '\\'`;
    const descriptionMatches = sql<boolean>`coalesce(${products.description}, '') ilike ${pattern} escape '\\'`;
    const categoryMatches = sql<boolean>`${categories.name} ilike ${pattern} escape '\\'`;
    const subcategoryMatches = sql<boolean>`coalesce(${subcategories.name}, '') ilike ${pattern} escape '\\'`;

    return this.database
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        imageUrl: products.imageUrl,
        categoryName: categories.name,
        subcategoryName: subcategories.name,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(subcategories, eq(products.subcategoryId, subcategories.id))
      .where(
        and(
          eq(products.isActive, true),
          eq(products.isAvailable, true),
          isNull(products.deletedAt),
          eq(categories.isActive, true),
          isNull(categories.deletedAt),
          or(
            isNull(products.subcategoryId),
            and(
              eq(subcategories.isActive, true),
              isNull(subcategories.deletedAt)
            )
          ),
          or(
            nameMatches,
            descriptionMatches,
            categoryMatches,
            subcategoryMatches
          )
        )
      )
      .orderBy(
        sql`case when ${nameMatches} then 0 else 1 end`,
        asc(products.name),
        asc(products.id)
      )
      .limit(limit);
  }
}
