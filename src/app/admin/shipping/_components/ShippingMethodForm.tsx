import type { ShippingMethod } from "@/lib/shipping/core";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

export async function ShippingMethodForm({ action, method }: { action: (formData: FormData) => void | Promise<void>; method?: ShippingMethod }) {
  const t = await getTranslations("Shipping");
  const input = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
  return (
    <form action={action} className="mx-auto max-w-2xl space-y-5 rounded-xl border p-4 sm:p-6">
      <label className="block space-y-1"><span>Name</span><input className={input} name="name" required maxLength={120} defaultValue={method?.name} /></label>
      <label className="block space-y-1"><span>Code</span><input className={input} name="code" required maxLength={64} pattern="[a-z0-9]+([_-][a-z0-9]+)*" defaultValue={method?.code} aria-describedby="shipping-code-help" /><span id="shipping-code-help" className="block text-xs text-muted-foreground">{t("codeHelp")}</span></label>
      <label className="block space-y-1"><span>Type</span><select className={input} name="type" defaultValue={method?.type ?? "home_delivery"}><option value="home_delivery">Home delivery</option><option value="pickup_point">Pickup point</option><option value="store_pickup">Store pickup</option></select></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1"><span>Price (ILS)</span><input className={input} name="price" type="number" min="0" step="1" required defaultValue={method?.price ?? 0} /></label>
        <label className="block space-y-1"><span>Free shipping threshold (optional)</span><input className={input} name="freeShippingThreshold" type="number" min="0" step="1" defaultValue={method?.freeShippingThreshold ?? ""} /></label>
      </div>
      <label className="block space-y-1"><span>Sort order</span><input className={input} name="sortOrder" type="number" min="-1000000" max="1000000" step="1" required defaultValue={method?.sortOrder ?? 0} /></label>
      <label className="flex min-h-11 items-center gap-3"><input name="isActive" type="checkbox" defaultChecked={method?.isActive ?? false} /><span>Available at checkout</span></label>
      <Button type="submit">Save shipping method</Button>
    </form>
  );
}
