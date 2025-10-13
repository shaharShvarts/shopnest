"use server";

import { checkoutSchema } from "../checkout/schema";

// import z from "zod";
// import { ZodError, SafeParseError } from "zod";

// const checkoutSchema = z.object({
//   email: z.string().min(1, "Email is required").email("Invalid email address"),

//   shipping_name: z.string().min(1, "Name is required"),
//   shipping_lastName: z.string().min(1, "Last name is required"),
//   shipping_address: z.string().min(1, "Address is required"),
//   shipping_city: z.string().min(1, "City is required"),
//   shipping_state: z.string().min(1, "City is required"),
//   shipping_postal: z.string().min(1, "Postal code is required"),
//   shipping_phone: z.string().min(1, "Phone is required"),
//   //   shipping_country: z.string().min(1, "Country is required"),
//   //   shipping_payment: z.string().min(1, "Payment method is required"),
// });

// const billingSchema = z.object({
//   billing_name: z.string().min(1, "Name is required"),
//   billing_lastName: z.string().min(1, "Last name is required"),
//   billing_address: z.string().min(1, "Address is required"),
//   billing_city: z.string().min(1, "City is required"),
//   billing_state: z.string().min(1, "State is required"),
//   billing_postal: z.string().min(1, "Postal code is required"),
//   billing_phone: z.string().min(1, "Phone is required"),
// });

export async function submitCheckout(prevState: any, formData: FormData) {
  const data = Object.fromEntries(formData);
  const result = checkoutSchema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  return { success: true, errors: {} };
}
