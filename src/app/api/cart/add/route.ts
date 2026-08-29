import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/drizzle/db";
import {
  carts,
  cartProducts,
  categories,
  products,
  subcategories,
} from "@/drizzle/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";
import { InventoryService } from "@/lib/inventory/core";

type RequestBody = {
  productId: number;
  quantity: number;
};

type DbError = Error & {
  cause?: {
    code?: string;
  };
};

export async function POST(req: NextRequest) {
  const db = await getDb();
  const { productId, quantity } = (await req.json()) as RequestBody;

  if (
    !Number.isSafeInteger(productId) ||
    productId <= 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    return NextResponse.json(
      { error: "Product and quantity must be positive whole numbers." },
      { status: 400 }
    );
  }

  const userId = req.cookies.get("user_id")?.value;
  const sessionId = req.cookies.get("session_id")?.value;
  const identifier = userId ?? sessionId;

  if (!identifier) {
    return NextResponse.json(
      { error: "Missing user/session ID" },
      { status: 400 }
    );
  }

  const [product] = await db
    .select({ price: products.price })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(subcategories, eq(products.subcategoryId, subcategories.id))
    .where(
      and(
        eq(products.id, productId),
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
        )
      )
    )
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const inventory = await new InventoryService(
    new DrizzleInventoryStore(db)
  ).getAvailability(productId);
  if (!inventory.purchasable || quantity > inventory.available) {
    return NextResponse.json(
      {
        error:
          inventory.available === 0
            ? "Product is out of stock."
            : `Only ${inventory.available} item(s) are currently available.`,
      },
      { status: 409 }
    );
  }

  const cartBy = userId
    ? eq(carts.userId, Number(userId))
    : eq(carts.sessionId, sessionId!);

  let cart = await db
    .select()
    .from(carts)
    .where(and(cartBy, eq(carts.isActive, true)))
    .limit(1);

  if (cart.length === 0) {
    const [newCart] = await db
      .insert(carts)
      .values(userId ? { userId: Number(userId) } : { sessionId })
      .returning();
    cart = [newCart];
  }

  const cartId = cart[0].id;

  const productPrice = product.price;
  const itemTotal = productPrice * quantity;

  try {
    await db.insert(cartProducts).values({
      cartId,
      productId,
      quantity,
    });
  } catch (error: unknown) {
    const err = error as DbError;

    if (err.cause?.code === "23505") {
      return NextResponse.json(
        { error: "Product already exists in cart" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }

  await db
    .update(carts)
    .set({
      totalPrice: sql`${carts.totalPrice} + ${itemTotal}`,
    })
    .where(eq(carts.id, cartId));

  return NextResponse.json(
    { success: true, message: "Product added to cart" },
    { status: 200 }
  );
}
