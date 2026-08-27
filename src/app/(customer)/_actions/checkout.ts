"use server";

import { customAlphabet } from "nanoid";
import { cookies } from "next/headers";
import { getDbForTenant } from "@/drizzle/db";
import {
  CheckoutError,
  createCheckoutOrder,
  type CheckoutDetails,
} from "@/lib/checkout/create-order";
import { DrizzleCheckoutStore } from "@/lib/drizzle-checkout-store";
import { getTenant } from "@/lib/tenant-context";
import { checkoutSchema } from "../checkout/schema";

const orderNumberSuffix = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
  8
);

export type CheckoutActionState = {
  success: boolean;
  errors: Record<string, string[] | undefined>;
  message?: string;
  order?: {
    id: number;
    number: string;
    totalPrice: number;
  };
};

export async function submitCheckout(
  _previousState: CheckoutActionState,
  formData: FormData
): Promise<CheckoutActionState> {
  const result = checkoutSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
      message: "Please correct the checkout details.",
    };
  }

  const tenant = await getTenant();
  if (!tenant) {
    return {
      success: false,
      errors: { checkout: ["Checkout requires a configured store tenant."] },
      message: "Unable to determine the store for this checkout.",
    };
  }

  const cookieStore = await cookies();
  const userIdValue = cookieStore.get("user_id")?.value;
  const parsedUserId = userIdValue ? Number(userIdValue) : null;
  const userId =
    parsedUserId && Number.isSafeInteger(parsedUserId) && parsedUserId > 0
      ? parsedUserId
      : null;
  const sessionId = cookieStore.get("session_id")?.value?.trim() || null;

  const shippingAddress = JSON.stringify({
    address: result.data.shipping_address,
    city: result.data.shipping_city,
    state: result.data.shipping_state,
    postalCode: result.data.shipping_postal,
  });
  const details: CheckoutDetails = {
    email: result.data.email,
    firstName: result.data.shipping_name,
    lastName: result.data.shipping_lastName,
    phoneNumber: result.data.shipping_phone,
    shippingMethod: result.data.shipping_method,
    shippingAddress,
    billingAddress: shippingAddress,
  };

  try {
    const store = new DrizzleCheckoutStore(getDbForTenant(tenant));
    const order = await createCheckoutOrder(
      store,
      { userId, sessionId },
      details,
      result.data.submission_token,
      createOrderNumber
    );

    return {
      success: true,
      errors: {},
      message: "Your order has been created.",
      order: {
        id: order.orderId,
        number: order.orderNumber,
        totalPrice: order.totalPrice,
      },
    };
  } catch (error) {
    const message =
      error instanceof CheckoutError
        ? error.message
        : "Unable to create the order. Please try again.";

    return {
      success: false,
      errors: { checkout: [message] },
      message,
    };
  }
}

function createOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `SN-${date}-${orderNumberSuffix()}`;
}
