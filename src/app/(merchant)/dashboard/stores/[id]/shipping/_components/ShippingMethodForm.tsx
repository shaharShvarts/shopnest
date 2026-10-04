import { Button } from "@/components/ui/button";
import { ManagementInput } from "@/components/management/ManagementInput";
import type { ShippingMethod } from "@/lib/shipping/core";

export function ShippingMethodForm({
  action,
  method,
}: {
  action: (formData: FormData) => void | Promise<void>;
  method?: ShippingMethod;
}) {
  return (
    <form
      action={action}
      className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-border bg-background p-5 sm:p-6"
    >
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Name</span>
        <ManagementInput
          name="name"
          required
          maxLength={120}
          defaultValue={method?.name}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Price (ILS)</span>
        <ManagementInput
          name="price"
          type="number"
          min="0"
          step="1"
          required
          defaultValue={method?.price ?? 0}
        />
      </label>

      <label className="flex min-h-11 items-center gap-3">
        <input
          name="requiresAddress"
          type="checkbox"
          defaultChecked={method?.requiresAddress ?? true}
          className="size-4"
        />
        <span>Require shipping address</span>
      </label>

      <label className="flex min-h-11 items-center gap-3">
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={method?.isActive ?? false}
          className="size-4"
        />
        <span>Available at checkout</span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Logo (optional)</span>
        <ManagementInput
          name="logo"
          type="file"
          accept="image/*"
        />
      </label>

      <Button type="submit" size="management">
        Save shipping method
      </Button>
    </form>
  );
}
