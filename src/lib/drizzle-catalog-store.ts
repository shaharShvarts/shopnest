import { eq } from "drizzle-orm";
import type { getDbForTenant } from "@/drizzle/db";
import { categories, products, subcategories } from "@/drizzle/schema";
import type {
  CatalogStore,
  NewCatalogCategory,
  NewCatalogProduct,
  NewCatalogSubcategory,
} from "./catalog/core";

type TenantDatabase = ReturnType<typeof getDbForTenant>;

export class DrizzleCatalogStore implements CatalogStore {
  constructor(private readonly db: TenantDatabase) {}

  async findCategory(id: number) {
    const [category] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return category ?? null;
  }

  async findSubcategory(id: number) {
    const [subcategory] = await this.db
      .select({ id: subcategories.id, categoryId: subcategories.categoryId })
      .from(subcategories)
      .where(eq(subcategories.id, id))
      .limit(1);
    return subcategory ?? null;
  }

  async createCategory(input: NewCatalogCategory) {
    await this.db.insert(categories).values(input);
  }

  async createSubcategory(input: NewCatalogSubcategory) {
    await this.db.insert(subcategories).values(input);
  }

  async createProduct(input: NewCatalogProduct) {
    await this.db.insert(products).values(input);
  }
}
