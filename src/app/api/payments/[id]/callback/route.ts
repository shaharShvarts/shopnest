import { getTenant } from "@/lib/tenant-context";
import { processPaymentCallback } from "@/lib/payments/service";
import { PaymentError } from "@/lib/payments/types";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const tenant = await getTenant();
  if (!tenant)
    return Response.json({ error: "unknown_tenant" }, { status: 404 });
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "invalid_callback" }, { status: 400 });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return Response.json({ error: "invalid_callback" }, { status: 413 });
      }
      chunks.push(value);
    }
    const { id } = await context.params;
    const status = await processPaymentCallback(
      tenant,
      id,
      Buffer.concat(chunks).toString("utf8"),
      request.headers,
    );
    return Response.json(
      { status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof PaymentError ? error.code : "verification_unavailable";
    const status =
      code === "not_implemented"
        ? 501
        : code === "payment_not_found"
          ? 404
          : ["invalid_confirmation", "invalid_callback"].includes(code)
            ? 400
            : 503;
    return Response.json({ error: "payment_not_confirmed" }, { status });
  }
}
