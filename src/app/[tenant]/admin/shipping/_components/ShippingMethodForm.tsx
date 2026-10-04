import type { ShippingMethod } from "@/lib/shipping/core";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

export async function ShippingMethodForm({ action, method }: { action: (formData: FormData) => void | Promise<void>; method?: ShippingMethod }) {
  const t = await getTranslations("Shipping");
  const input = "min-h-11 w-full rounded-md border bg-background px-3 py-2";
  return (
    <form action={action} className="mx-auto max-w-2xl space-y-5 rounded-xl border p-4 sm:p-6">
      <label className="block space-y-1"><span>Name</span><input className={input} name="name" required maxLength={120} defaultValue={method?.name} aria-describedby="shipping-name-help" /><span id="shipping-name-help" className="block text-xs text-muted-foreground">{t("nameHelp")}</span></label>
      <label className="block space-y-1"><span>Price (ILS)</span><input className={input} name="price" type="number" min="0" step="1" required defaultValue={method?.price ?? 0} /></label>
      <label className="flex min-h-11 items-center gap-3"><input name="requiresAddress" type="checkbox" defaultChecked={method?.requiresAddress ?? true} /><span>Require shipping address</span></label>
      <label className="flex min-h-11 items-center gap-3"><input name="isActive" type="checkbox" defaultChecked={method?.isActive ?? false} /><span>Available at checkout</span></label>
      <Button type="submit">Save shipping method</Button>
    </form>
  );
}
