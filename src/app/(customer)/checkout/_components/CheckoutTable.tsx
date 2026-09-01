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
  customer,
}: {
  submissionToken: string;
  customer: { email: string; displayName: string | null } | null;
}) {
  const [state, formAction] = useActionState(submitCheckout, initialState);

  if (state.success && state.order) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-3 rounded-lg border p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-green-700 sm:text-2xl">
          Order confirmed
        </h2>
        <p>Your order number is:</p>
        <p className="break-all font-mono text-lg font-semibold sm:text-xl">
          {state.order.number}
        </p>
        <p>Total: {formatCurrency(state.order.totalPrice)}</p>
        <p className="text-sm text-muted-foreground">
          Payment is still pending. No payment has been collected.
        </p>
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
          Shipping Address
        </h2>
        <ShippingAddress
          prefix="shipping"
          defaultName={customer?.displayName ?? ""}
        />
      </section>

      <section className="rounded-lg border p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold sm:text-xl">
          Shipping Method
        </h2>
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

function ShippingOption({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 focus-within:ring-2 focus-within:ring-ring">
      <input
        type="radio"
        name="shipping_method"
        value={value}
        required
        className="size-4 shrink-0"
      />
      <span className="min-w-0 break-words">{label}</span>
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
