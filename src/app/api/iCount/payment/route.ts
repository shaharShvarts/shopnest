// Explicitly retired: client amounts and shared credentials bypassed tenant orders.
// See docs/payments.md. Retain 410 for legacy callers, with no provider calls.
export async function POST() {
  return Response.json({ error: "legacy_payment_retired", message: "Use tenant checkout to create an order and initiate payment." }, { status: 410 });
}
