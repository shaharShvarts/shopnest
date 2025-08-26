import { NextRequest, NextResponse } from "next/server";
import { db } from "@/drizzle/db";
import { carts, cartProducts, products } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { productId, quantity } = await req.json();
  const userId = (await cookies()).get("user_id")?.value;
  const sessionId = (await cookies()).get("session_id")?.value;

  if (!userId && !sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
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
  } catch (error) {
    const err = error as Error;

    return NextResponse.json(
      { error: "Product already exists in cart", err: err.message },
      { status: 409 }
    );
  }

  // 4. Update cart totalPrice
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

// export async function GET(req: Request) {
//   const { searchParams } = new URL(req.url);
//   const userId = searchParams.get("userId");
//   const sessionId = searchParams.get("sessionId");

//   const cartBy = userId
//     ? eq(carts.userId, Number(userId))
//     : eq(carts.sessionId, sessionId!);

//   const [cart] = await db
//     .select()
//     .from(carts)
//     .where(and(cartBy, eq(carts.isActive, true)))
//     .limit(1);

//   const count = cart ? cart.items.length : 0;

//   return NextResponse.json({ count });
// }
