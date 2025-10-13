// app/api/payment/route.js
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. Get the order details from the request body
    const { amount, customerName, customerEmail } = await req.json();

    // 2. Prepare the data payload for the iCount API
    const icountPayload = {
      // Use your payment processor integration reference
      company_id: process.env.ICOUNT_COMPANY_ID,
      payment_type: "credit_card",
      amount: amount,
      payer_name: customerName,
      payer_email: customerEmail,
      // You can add more details like invoice items or notes
    };

    // 3. Call the iCount API to create the payment request
    const response = await fetch(
      "https://api.icount.co.il/charge-credit-card",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Use a secure API key from your environment variables
          Authorization: `Bearer ${process.env.ICOUNT_API_KEY}`,
        },
        body: JSON.stringify(icountPayload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to create iCount payment");
    }

    // 4. Return the secure payment link to the client
    return NextResponse.json({ paymentUrl: data.redirect_url });
  } catch (error: unknown) {
    let errorMessage = "Unknown error";

    if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.error("iCount API error:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
