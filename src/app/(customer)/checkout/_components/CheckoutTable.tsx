"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  submitCheckout,
  type CheckoutActionState,
} from "../../_actions/checkout";
import ShippingAddress from "./ShippingAddress";
import { Button } from "@/components/ui/button";
import type { ShippingQuote } from "@/lib/shipping/core";
import { checkoutPaymentMessage } from "@/lib/payments/presentation";
import {
  getCheckoutShippingSelection,
  getDefaultShippingMethodId,
} from "@/lib/shipping/checkout-selection";

const initialState: CheckoutActionState = {
  success: false,
  errors: {},
};

export default function CheckoutTable({
  submissionToken,
  customer,
  itemsSubtotal,
  shippingMethods,
}: {
  submissionToken: string;
  customer: { email: string; displayName: string | null } | null;
  itemsSubtotal: number;
  shippingMethods: ShippingQuote[];
}) {
  const [state, formAction] = useActionState(submitCheckout, initialState);
  const paymentT = useTranslations("Payments");
  const [selectedMethodId, setSelectedMethodId] = useState<number | null>(() =>
    getDefaultShippingMethodId(shippingMethods)
  );
  const selection = getCheckoutShippingSelection(
    shippingMethods,
    selectedMethodId,
    itemsSubtotal
  );

  if (state.success && state.order) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-3 rounded-lg border p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-green-700 sm:text-2xl">
          {paymentT("orderCreated")}
        </h2>
        <p>Your order number is:</p>
        <p className="break-all font-mono text-lg font-semibold sm:text-xl">
          {state.order.number}
        </p>
        <p>Items: {formatCurrency(state.order.itemsSubtotal)}</p>
        <p>Shipping: {formatCurrency(state.order.shippingTotal)}</p>
        <p>Total: {formatCurrency(state.order.totalPrice)}</p>
        <p className="text-sm text-muted-foreground">
          {paymentT(checkoutPaymentMessage(state.payment))}
        </p>
        {state.payment?.redirectUrl && <Button asChild><a href={state.payment.redirectUrl} rel="noreferrer">{paymentT("continuePayment")}</a></Button>}
      </section>
    );
  }

  return (
    <form action={formAction} className="mx-auto w-full max-w-2xl space-y-5 sm:space-y-6">
      <input type="hidden" name="submission_token" value={submissionToken} />

      <section className="rounded-lg border p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold sm:text-xl">
          Contact Information
        </h2>
        <input
          name="email"
          type="email"
          placeholder="Email Address"
          autoComplete="email"
          required
          defaultValue={customer?.email ?? ""}
          className="min-h-11 w-full rounded border p-2"
        />
        <FieldErrors errors={state.errors.email} />
      </section>

      <section className="rounded-lg border p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold sm:text-xl">
          Shipping Method
        </h2>
        {shippingMethods.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {shippingMethods.map((method) => (
              <ShippingOption
                key={method.id}
                method={method}
                checked={method.id === selectedMethodId}
                onSelect={() => setSelectedMethodId(method.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No shipping methods are currently available.</p>
        )}
        <FieldErrors errors={state.errors.shipping_method_id} />
      </section>

      <section className="rounded-lg border p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold sm:text-xl">
          {selection.addressHeading}
        </h2>
        <ShippingAddress
          prefix="shipping"
          defaultName={customer?.displayName ?? ""}
          requireAddress={selection.requiresAddress}
        />
      </section>

      <section className="space-y-2 rounded-lg border p-4 sm:p-6">
        <div className="flex justify-between"><span>Items subtotal</span><span>{formatCurrency(itemsSubtotal)}</span></div>
        <div className="flex justify-between"><span>Shipping</span><span>{selection.method ? formatCurrency(selection.shippingTotal) : "—"}</span></div>
        <div className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{formatCurrency(selection.totalPrice)}</span></div>
      </section>

      <section className="space-y-2 rounded-lg border p-4 sm:p-6">
        <h2 className="text-lg font-semibold sm:text-xl">Payment</h2>
        <p className="text-sm text-muted-foreground">
          Payment will remain pending. Online payment is not part of this
          checkout yet.
        </p>
      </section>

      {!state.success && state.message && (
        <p className="text-destructive">{state.message}</p>
      )}
      <FieldErrors errors={state.errors.checkout} />
      <SubmitButton />
    </form>
  );
}

function ShippingOption({ method, checked, onSelect }: { method: ShippingQuote; checked: boolean; onSelect: () => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 focus-within:ring-2 focus-within:ring-ring">
      <input
        type="radio"
        name="shipping_method_id"
        value={method.id}
        checked={checked}
        onChange={onSelect}
        required
        className="size-4 shrink-0"
      />
      <span className="min-w-0 flex-1 break-words">
        <span className="block font-medium">{method.name}</span>
        <span className="block text-sm capitalize text-muted-foreground">{method.type.replaceAll("_", " ")}</span>
      </span>
      <span className="font-medium">{method.shippingPrice === 0 ? "Free" : formatCurrency(method.shippingPrice)}</span>
    </label>
  );
}

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-destructive mt-2">{errors.join(" ")}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-h-11 w-full sm:w-auto sm:min-w-44"
    >
      {pending ? "Creating order..." : "Place Order"}
    </Button>
  );
}

function formatCurrency(priceInMinorUnits: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
  }).format(priceInMinorUnits);
}
