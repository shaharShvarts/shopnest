// app/checkout/page.js
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CheckoutPageTest() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCheckout = async () => {
    setLoading(true);
    try {
      // 1. Call your Next.js API route
      const response = await fetch("/api/iCount/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1, // Example: dynamic value from your cart
          customerName: "John Doe",
          customerEmail: "john.doe@example.com",
        }),
      });

      if (!response.ok) {
        throw new Error("Payment initialization failed");
      }

      const data = await response.json();

      // 2. Redirect the user to the secure iCount payment page
      if (data.paymentUrl) {
        router.push(data.paymentUrl);
      }
    } catch (error) {
      console.error("Error during checkout:", error);
      alert("An error occurred during payment. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Checkout</h1>
      <button onClick={handleCheckout} disabled={loading}>
        {loading ? "Processing..." : "Pay with iCount"}
      </button>
    </div>
  );
}
