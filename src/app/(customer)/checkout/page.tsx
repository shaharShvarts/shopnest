import { PageHeader } from "@/app/components/PageHeader";
import CheckoutTable from "./_components/CheckoutTable";

export default function CheckoutPage() {
  return (
    <div>
      <PageHeader>Secure Checkout</PageHeader>
      <CheckoutTable />
    </div>
  );
}
