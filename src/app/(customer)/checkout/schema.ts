import { z } from "zod";

const requiredText = (message: string) => z.string().trim().min(1, message);

export const checkoutSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  shipping_name: requiredText("First name is required"),
  shipping_lastName: requiredText("Last name is required"),
  shipping_address: z.string().trim().default(""),
  shipping_city: z.string().trim().default(""),
  shipping_state: z.string().trim().default(""),
  shipping_postal: z.string().trim().default(""),
  shipping_phone: requiredText("Phone number is required"),
  shipping_method_id: z.coerce.number().int().positive("Shipping method is required"),
  submission_token: z.string().uuid("Invalid checkout submission"),
});

export type CheckoutData = z.infer<typeof checkoutSchema>;
