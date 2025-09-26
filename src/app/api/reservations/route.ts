import { z } from "zod";
import { db } from "@/drizzle/db";
import { and, desc, eq, gt, sql } from "drizzle-orm/sql";
import { reservations, products } from "@/drizzle/schema";
import { cookies } from "next/headers";

const reservationSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = reservationSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
    });
  }

  // Get user ID or session ID from cookies
  const cookieStore = await cookies();
  const userId = cookieStore.get("session_id")?.value;

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const { productId } = parsed.data;

  // Get total stock
  const product = await db.query.products.findFirst({
    where: eq(products.id, Number(productId)),
  });

  if (!product) {
    return new Response(JSON.stringify({ error: "Product not found" }), {
      status: 404,
    });
  }

  // Get active reservations
  const [activeReservations] = await db
    .select({ totalReserved: sql`COALESCE(SUM(quantity), 0)` })
    .from(reservations)
    .where(
      and(
        eq(reservations.productId, productId),
        gt(reservations.expiresAt, new Date())
      )
    );

  const reservedQty = Number(activeReservations?.totalReserved ?? 0);
  const quantity = product.quantity - reservedQty;

  if (quantity == 0) {
    return new Response(
      JSON.stringify({ error: "Not enough stock available" }),
      { status: 409 }
    );
  }

  if (quantity <= 0) {
    return new Response(
      JSON.stringify({ error: "Quantity must be positive" }),
      { status: 400 }
    );
  }

  const type = "Watch";
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await db.insert(reservations).values({
      type,
      productId,
      quantity,
      userId,
      expiresAt,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ success: true }), { status: 201 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const parsed = reservationSchema.safeParse({
    productId: searchParams.get("productId"),
  });

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
    });
  }

  // Get user ID or session ID from cookies
  const cookieStore = await cookies();
  const userId = cookieStore.get("session_id")?.value;

  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const { productId } = parsed.data;

  // Get total stock
  const product = await db.query.products.findFirst({
    where: eq(products.id, Number(productId)),
  });

  if (!product) {
    return new Response(JSON.stringify({ error: "Product not found" }), {
      status: 404,
    });
  }

  // Get active reservations
  const [activeReservations] = await db
    .select({ totalReserved: sql`SUM(quantity)` })
    .from(reservations)
    .where(
      and(
        eq(reservations.productId, productId),
        gt(reservations.expiresAt, new Date())
      )
    );

  const reservedQty = Number(activeReservations?.totalReserved ?? 0);
  const quantity = product.quantity - reservedQty;

  if (quantity == 0) {
    return new Response(
      JSON.stringify({ error: "Not enough stock available", quantity }),
      { status: 409 }
    );
  }

  if (quantity <= 0) {
    return new Response(
      JSON.stringify({ error: "Quantity must be positive" }),
      { status: 400 }
    );
  }

  return new Response(JSON.stringify({ quantity }), { status: 200 });
}
