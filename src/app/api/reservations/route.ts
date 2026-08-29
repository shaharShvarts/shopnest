import { z } from "zod";
import { getDb } from "@/drizzle/db";
import { cookies } from "next/headers";
import { InventoryError, InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";

const reservationSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

// Stock is reserved only by a checkout attempt. Adding to a cart or probing this
// endpoint must never hold stock.
export async function POST() {
  return Response.json(
    { error: "Inventory reservations are created during checkout only." },
    { status: 405, headers: { Allow: "GET" } }
  );
}

export async function GET(req: Request) {
  const parsed = reservationSchema.safeParse({
    productId: new URL(req.url).searchParams.get("productId"),
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cookieStore = await cookies();
  if (!cookieStore.get("session_id")?.value) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await getDb();
    const availability = await new InventoryService(
      new DrizzleInventoryStore(db)
    ).getAvailability(parsed.data.productId);
    return Response.json({
      quantity: availability.available,
      physical: availability.physical,
      reserved: availability.reserved,
      status: availability.status,
    });
  } catch (error) {
    if (error instanceof InventoryError && error.code === "product_not_found") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
