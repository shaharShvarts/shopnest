import { z } from "zod";

const requiredText = (message: string) => z.string().trim().min(1, message);

export const checkoutSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  shipping_name: requiredText("First name is required"),
  shipping_lastName: requiredText("Last name is required"),
  shipping_address: requiredText("Address is required"),
  shipping_city: requiredText("City is required"),
  shipping_state: requiredText("State or country is required"),
  shipping_postal: requiredText("Postal code is required"),
  shipping_phone: requiredText("Phone number is required"),
  shipping_method: z.enum(["regular", "expedited", "express"], {
    message: "Shipping method is required",
  }),
  submission_token: z.string().uuid("Invalid checkout submission"),
});

export type CheckoutData = z.infer<typeof checkoutSchema>;
