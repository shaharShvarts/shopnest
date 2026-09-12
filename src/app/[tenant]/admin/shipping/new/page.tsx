import { AdminFormHeader } from "../../_components/AdminFormHeader";
import { createShippingMethod } from "../../_actions/shipping";
import { ShippingMethodForm } from "../_components/ShippingMethodForm";

export default function NewShippingMethodPage() {
  return <div className="space-y-6"><AdminFormHeader title="New shipping method" backHref="/admin/shipping" backLabel="Back to Shipping" /><ShippingMethodForm action={createShippingMethod} /></div>;
}
