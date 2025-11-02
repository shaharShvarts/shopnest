"use server";

import z from "zod";
// import type { AddToCartState } from "../products/_components/ProductDetails";
import // addProductToCart,
// deleteProductFromCart,
// fetchCartId,
// getProductPrice,
// updateTotalPrice,
"./cartVerification";
// import { revalidatePath } from "next/cache";
import { ShippingFormState } from "../shipping/_components/ShippingTable";
import { cookies } from "next/headers";
import { POST as iCountPayment } from "@/app/api/iCount/payment/route";

const shippingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  city: z.string().min(1, "City is required"),
  street: z.string().min(1, "Street address is required"),
  apartment: z.coerce.number().int().min(1, "Apartment number is required"),
  building: z.coerce.number().int().min(1, "Building number is required"),
  floor: z.coerce.number().int().optional(),
  entry: z.string().optional(),
  phone: z.string().min(1, "Phone number is required"),
  email: z.string().min(1, "Email address is required"),
  notes: z.string().optional(),
});

export async function redirectToPurchase(
  _state: ShippingFormState,
  formData: FormData
) {
  const result = shippingSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  // Set cookie to expire in 30 days
  (await cookies()).set("address", JSON.stringify(result.data), {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  try {
    const payload = {
      amount: 1,
      customerName: "John Doe",
      customerEmail: "john.doe@example.com",
    };

    const request = new Request("http://localhost/api/iCount/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await iCountPayment(request);

    // 1. Call your Next.js API route
    // const response = await fetch("/api/iCount/payment", );

    // if (!response.ok) {
    //   throw new Error("Payment initialization failed");
    // }
    if (!response.ok) {
      console.error("iCount error status:", response.status);
    }
    // const data = await response.json();
    // console.log(data);
    // // 2. Redirect the user to the secure iCount payment page
    // if (data.paymentUrl) {
    //   // router.push(data.paymentUrl);
    // }
  } catch (error) {
    console.error("Error during checkout:", error);
    // alert("An error occurred during payment. Please try again.");
    // setLoading(false);
  }

  return { success: true, errors: {} };
}
