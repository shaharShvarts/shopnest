import {
  AdminAuthorizationError,
  requireTenantAdminDb,
} from "@/lib/admin-auth/server";
import { subcategories } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");

    if (!categoryId) {
      return NextResponse.json({ error: "Missing categoryId" }, { status: 400 });
    }

    const subcategories = await fetchSubcategoriesByCategoryId(categoryId);

    return NextResponse.json(subcategories);
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

// Example mock function
async function fetchSubcategoriesByCategoryId(categoryId: string) {
  const { db } = await requireTenantAdminDb();
  const results = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, Number(categoryId)));

  return results || [];
}
