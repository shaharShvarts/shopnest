import {
  AdminAuthorizationError,
  requireTenantAdminDb,
} from "@/lib/admin-auth/server";
import { categories, subcategories } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");

    const parsedCategoryId = Number(categoryId);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }

    const { db } = await requireTenantAdminDb();
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, parsedCategoryId))
      .limit(1);
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const subcategoryRows = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.categoryId, parsedCategoryId))
      .orderBy(subcategories.name);

    return NextResponse.json(subcategoryRows);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json(
        { error: "Admin authorization required" },
        { status: error.status }
      );
    }
    throw error;
  }
}
