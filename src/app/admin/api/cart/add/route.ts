import { NextRequest, NextResponse } from "next/server";
import { db } from "@/drizzle/db";
import { carts, cartProducts, products } from "@/drizzle/schema";
import { or, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { productId, quantity } = await req.json();
  const userId = (await cookies()).get("user_id")?.value;
  const sessionId = (await cookies()).get("session_id")?.value;

  if (!userId && !sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // 1. Find or create cart
  const condition = or(
    eq(carts.userId, Number(userId)),
    eq(carts.sessionId, sessionId!)
  );

  const [cart] = await db.select().from(carts).where(condition).limit(1);

  const cartId = cart.id;

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
  await db.insert(cartProducts).values({
    cartId,
    productId,
    quantity,
  });

  // 4. Update cart totalPrice
  await db
    .update(carts)
    .set({
      totalPrice: sql`${carts.totalPrice} + ${itemTotal}`,
    })
    .where(eq(carts.id, cartId));

  return NextResponse.json({ success: true });
}
