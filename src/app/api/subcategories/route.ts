import { db } from "@/drizzle/db";
import { subcategories } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");

  if (!categoryId) {
    return NextResponse.json({ error: "Missing categoryId" }, { status: 400 });
  }

  const subcategories = await getSubcategoriesByCategoryId(categoryId);

  return NextResponse.json(subcategories);
}

// Example mock function
async function getSubcategoriesByCategoryId(categoryId: string) {
  const results = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, Number(categoryId)));

  return results || [];
}
