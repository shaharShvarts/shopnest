"use server";

import { customAlphabet } from "nanoid";
import { getDbForTenant } from "@/drizzle/db";
import {
  CheckoutError,
  createCheckoutOrder,
  type CheckoutDetails,
} from "@/lib/checkout/create-order";
import { DrizzleCheckoutStore } from "@/lib/drizzle-checkout-store";
import { getTenant } from "@/lib/tenant-context";
import { checkoutSchema } from "../checkout/schema";
import { commerceOwnerKey, getCommerceIdentity } from "@/lib/customer-commerce/identity";
import { beginOrderPayment } from "@/lib/payments/service";
import type { PaymentResult } from "@/lib/payments/types";
import { requireActiveTenantStorefront } from "@/lib/admin-auth/server";

const orderNumberSuffix = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
  8
);

export type CheckoutActionState = {
  success: boolean;
  errors: Record<string, string[] | undefined>;
  message?: string;
  payment?: PaymentResult;
  order?: {
    id: number;
    number: string;
    totalPrice: number;
    itemsSubtotal: number;
    shippingTotal: number;
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

  const identity = await getCommerceIdentity();
  await requireActiveTenantStorefront();

  const shippingAddress = result.data.shipping_address
    ? {
        address: result.data.shipping_address,
        city: result.data.shipping_city,
        state: result.data.shipping_state,
        postalCode: result.data.shipping_postal,
      }
    : null;
  const details: CheckoutDetails = {
    email: result.data.email,
    firstName: result.data.shipping_name,
    lastName: result.data.shipping_lastName,
    phoneNumber: result.data.shipping_phone,
    shippingMethodId: result.data.shipping_method_id,
    shippingAddress,
  };

  try {
    const store = new DrizzleCheckoutStore(getDbForTenant(tenant));
    const order = await createCheckoutOrder(
      store,
      identity,
      details,
      result.data.submission_token,
      createOrderNumber
    );

    // A committed order/hold survives an unavailable payment provider.
    let payment: PaymentResult = { status: "created", redirectUrl: null };
    const ownerKey = commerceOwnerKey(identity);
    if (ownerKey) {
      try { payment = await beginOrderPayment(tenant, order.orderId, ownerKey); }
      catch { /* Remains unpaid; the existing 15-minute hold expires logically. */ }
    }
    return {
      success: true,
      payment,
      errors: {},
      message: "Your order has been created.",
      order: {
        id: order.orderId,
        number: order.orderNumber,
        totalPrice: order.totalPrice,
        itemsSubtotal: order.itemsSubtotal,
        shippingTotal: order.shippingTotal,
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
