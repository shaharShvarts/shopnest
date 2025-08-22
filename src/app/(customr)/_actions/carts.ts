"use server";

import { redirect } from "next/navigation";
import z from "zod";

const productSchema = z.object({
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
});

export async function addToCart(productId: number, _: any, formData: FormData) {
  const result = productSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      type: "validation",
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { quantity } = result.data;

  const res = await fetch("/api/cart/add", {
    method: "POST",
    body: JSON.stringify({ productId, quantity }),
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      success: false,
      type: "api",
      status: res.status,
      message: data.error || "Something went wrong",
    };
  }

  // ✅ Redirect to categories page
  redirect("/categories");
}
