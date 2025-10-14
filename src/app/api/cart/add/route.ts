import { NextRequest, NextResponse } from "next/server";
import { db } from "@/drizzle/db";
import { carts, cartProducts, products, reservations } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";

type RequestBody = {
  productId: number;
  quantity: number;
};

export async function POST(req: NextRequest) {
  const { productId, quantity } = (await req.json()) as RequestBody;
  // const userId = (await cookies()).get("user_id")?.value;
  // const sessionId = (await cookies()).get("session_id")?.value;

  const userId = req.cookies.get("user_id")?.value;
  const sessionId = req.cookies.get("session_id")?.value;

  const identifier = userId ?? sessionId;

  if (!identifier) {
    return new Response(JSON.stringify({ error: "Missing user/session ID" }), {
      status: 400,
    });
  }

  // // 1. Find or create cart
  const cartBy = userId
    ? eq(carts.userId, Number(userId))
    : eq(carts.sessionId, sessionId!);

  let cart = await db.select().from(carts).where(cartBy).limit(1);

  if (cart.length === 0) {
    const [newCart] = await db
      .insert(carts)
      .values(userId ? { userId: Number(userId) } : { sessionId })
      .returning();
    cart = [newCart];
  }

  const cartId = cart[0].id;

  // 2. Get product price
  const [product] = await db
    .select({ price: products.price })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if ([product].length === 0) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const productPrice = product.price;
  const itemTotal = productPrice * quantity;

  // 3. Add product to cart
  try {
    await db.insert(cartProducts).values({
      cartId,
      productId,
      quantity,
    });
  } catch (error: any) {
    if (error.cause.code === "23505") {
      // PostgreSQL unique violation
      return NextResponse.json(
        { error: "Product already exists in cart" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }

  // 4. Update cart totalPrice
  await db
    .update(carts)
    .set({
      totalPrice: sql`${carts.totalPrice} + ${itemTotal}`,
    })
    .where(eq(carts.id, cartId));

  // 5. If reservation exists for this user and product, extend the expiry time
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
