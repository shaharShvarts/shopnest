"use server";

import z from "zod";
import type { AddToCartState } from "../products/_components/ProductDetails";
import {
  addProductToCart,
  deleteProductFromCart,
  fetchCartId,
  getProductPrice,
  updateTotalPrice,
} from "./cartVerification";
import { revalidatePath } from "next/cache";

const shippingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  city: z.string().min(1, "City is required"),
  street: z.string().min(1, "Street address is required"),
  Building: z.coerce.number().int().min(1, "Building number is required"),
  apartment: z.coerce.number().int().min(1, "Apartment number is required"),
  floor: z.coerce.number().int().optional(),
  entry: z.string().optional(),
  phone: z.string().min(1, "Phone number is required"),
  email: z.string().min(1, "Email address is required"),
  notes: z.string().min(1, "Delivery notes are required"),
});

export async function redirectToPurchase(
  prevState: unknown,
  formData: FormData
) {
  const result = shippingSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }
}
