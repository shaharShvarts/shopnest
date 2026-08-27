"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitCheckout,
  type CheckoutActionState,
} from "../../_actions/checkout";
import ShippingAddress from "./ShippingAddress";
import { Button } from "@/components/ui/button";

const initialState: CheckoutActionState = {
  success: false,
  errors: {},
};

export default function CheckoutTable({
  submissionToken,
}: {
  submissionToken: string;
}) {
  const [state, formAction] = useActionState(submitCheckout, initialState);

  if (state.success && state.order) {
    return (
      <section className="max-w-2xl mx-auto rounded border p-6 space-y-3">
        <h2 className="text-2xl font-semibold text-green-700">
          Order confirmed
        </h2>
        <p>Your order number is:</p>
        <p className="text-xl font-mono font-semibold">{state.order.number}</p>
        <p>Total: {formatCurrency(state.order.totalPrice)}</p>
        <p className="text-sm text-muted-foreground">
          Payment is still pending. No payment has been collected.
        </p>
      </section>
    );
  }

  return (
    <form action={formAction} className="space-y-6 max-w-2xl mx-auto">
      <input type="hidden" name="submission_token" value={submissionToken} />

      <section>
        <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
        <input
          name="email"
          type="email"
          placeholder="Email Address"
          autoComplete="email"
          required
          className="w-full border p-2 rounded"
        />
        <FieldErrors errors={state.errors.email} />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Shipping Address</h2>
        <ShippingAddress prefix="shipping" />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Shipping Method</h2>
        <div className="space-y-2">
          <ShippingOption value="regular" label="Regular (3–5 business days)" />
          <ShippingOption
            value="expedited"
            label="Expedited (1–3 business days)"
          />
          <ShippingOption value="express" label="Express (1–2 business days)" />
        </div>
        <FieldErrors errors={state.errors.shipping_method} />
      </section>

      <section className="border p-4 rounded space-y-2">
        <h2 className="text-xl font-semibold">Payment</h2>
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

function ShippingOption({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="radio" name="shipping_method" value={value} required />
      <span>{label}</span>
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
    <Button type="submit" disabled={pending} aria-disabled={pending}>
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
