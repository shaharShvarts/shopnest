import z from "zod";
const productSchema = z.object({
  quantity: z.coerce.number().min(0, "Quantity must be a non-negative number"),
});

export async function addToCart(productId: number, _: any, formData: FormData) {
  const result = productSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { quantity } = result.data;

  await fetch("/api/cart/add", {
    method: "POST",
    body: JSON.stringify({ productId, quantity }),
    headers: { "Content-Type": "application/json" },
  });

  return {
    success: true,
    message: "Product added to cart successfully.",
  };
}
