import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/drizzle/db";
import {
  carts,
  cartProducts,
  categories,
  products,
  reservations,
  subcategories,
} from "@/drizzle/schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

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

  const userId = req.cookies.get("user_id")?.value;
  const sessionId = req.cookies.get("session_id")?.value;
  const identifier = userId ?? sessionId;

  if (!identifier) {
    return NextResponse.json(
      { error: "Missing user/session ID" },
      { status: 400 }
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
        gt(products.quantity, 0),
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

  const type = "Cart";
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db
    .update(reservations)
    .set({ type, expiresAt })
    .where(
      and(
        eq(reservations.productId, productId),
        eq(reservations.userId, identifier)
      )
    );

  return NextResponse.json(
    { success: true, message: "Product added to cart" },
    { status: 200 }
  );
}
