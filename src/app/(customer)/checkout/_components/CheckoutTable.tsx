"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { submitCheckout } from "../../_actions/checkout";
import ShippingAddress from "./ShippingAddress";
import { Button } from "@/components/ui/button";
import { CreditCard, Apple } from "lucide-react";
import { BsPaypal } from "react-icons/bs";
import { FaApplePay } from "react-icons/fa";
import { FaGooglePay } from "react-icons/fa";
import { BsCreditCard } from "react-icons/bs";
import { HiCreditCard } from "react-icons/hi2";
import { FaCcPaypal } from "react-icons/fa6";

export default function CheckoutTable() {
  const t = useTranslations("CheckoutPage");

  const [showBilling, setShowBilling] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [state, formAction] = useActionState(submitCheckout, {
    success: false,
    errors: {},
  });

  return (
    <form action={formAction} className="space-y-6 max-w-2xl mx-auto">
      {/* Contact Info */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
        <input
          name="email"
          type="email"
          placeholder="Email Address"
          className="w-full border p-2 rounded"
        />
        {state.errors?.email && (
          <div className="text-destructive">{state.errors.email}</div>
        )}
      </section>

      <h2 className="text-xl font-semibold mb-4">Shipping Address</h2>
      <ShippingAddress prefix="shipping" />

      {/* Shipping Method */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Shipping Method</h2>
        <p className="text-sm mb-2">
          Your items are estimated to arrive on: <strong>Tue, Mar 28</strong>
        </p>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input type="radio" name="shipping" value="regular" />
            <span>USA - Regular: $8.00 (3–5 Business Days)</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="radio" name="shipping" value="expedited" />
            <span>USA - Expedited: $12.00 (1–3 Business Days)</span>
          </label>
          <label className="flex items-center space-x-2">
            <input type="radio" name="shipping" value="express" />
            <span>USA - Express: $35.00 (1–2 Business Days)</span>
          </label>
        </div>
      </section>

      <section className=" border p-2 rounded space-y-4">
        <h2 className="text-xl font-semibold mb-4">Payment Method</h2>
        <div className="grid grid-cols-4 justify-items-center">
          <label className="flex items-center space-x-2">
            <input
              type="radio"
              name="payment"
              value="credit"
              checked={paymentMethod === "credit"}
              onChange={() => setPaymentMethod("credit")}
              required
            />
            <HiCreditCard className="w-5 h-5 text-blue-600" />
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="radio"
              name="payment"
              value="paypal"
              checked={paymentMethod === "paypal"}
              onChange={() => setPaymentMethod("paypal")}
            />
            <BsPaypal className="w-5 h-5 text-blue-600" />
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="radio"
              name="payment"
              value="applepay"
              checked={paymentMethod === "applepay"}
              onChange={() => setPaymentMethod("applepay")}
            />
            <FaApplePay className="w-10 h-10 text-blue-600" />
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="radio"
              name="payment"
              value="googlepay"
              checked={paymentMethod === "googlepay"}
              onChange={() => setPaymentMethod("googlepay")}
            />
            <FaGooglePay className="w-10 h-10 text-blue-600" />
          </label>
        </div>

        {/* Payment Method */}
        {paymentMethod === "credit" && (
          <section>
            <div className="grid grid-cols-2 gap-4">
              <input
                name="cardName"
                placeholder="Name on Card"
                className="border p-2 rounded"
              />
              <input
                name="cardNumber"
                placeholder="Card Number"
                className="border p-2 rounded"
              />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <input
                name="expiry"
                placeholder="Expiration (MM/YY)"
                className="border p-2 rounded"
              />
              <input
                name="securityCode"
                placeholder="Security Code"
                className="border p-2 rounded"
              />
              <input
                name="cardId"
                placeholder="Card ID"
                className="w-full border p-2 rounded"
              />
            </div>
          </section>
        )}
      </section>
      {/* Billing Address */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Billing Address</h2>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            name="billing_enabled"
            checked={!showBilling}
            onChange={() => setShowBilling((prev) => !prev)}
          />
          <span>Use same address as shipping</span>
        </label>

        {showBilling && <ShippingAddress prefix="billing" />}
      </section>

      {/* Additional Info */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Additional Information</h2>
        <p className="text-sm text-gray-700">
          Note: You agree to Shopnest’s Authorized Reseller Program, and
          understand that this product is not intended for resale.
        </p>
      </section>

      {/* Order Summary */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
        <div className="bg-gray-100 p-4 rounded space-y-2">
          <p>Item: Raspberry Pi 800 (Qty: 1)</p>
          <p>Subtotal: $434.75</p>
          <p>Shipping: $8.00</p>
          <p className="font-bold">Total: $442.75</p>
        </div>
      </section>

      {/* Submit */}
      <Button type="submit">Place Order</Button>

      {state.success && (
        <p className="text-green-600 mt-4">Order submitted successfully!</p>
      )}
    </form>
  );
}
