import { PageHeader } from "@/app/components/PageHeader";
import CheckoutTable from "./_components/CheckoutTable";
import CheckoutPageTest from "./_components/Checkout";

export default function CheckoutPage() {
  return (
    <div>
      <PageHeader>Secure Checkout</PageHeader>
      {/* <CheckoutTable /> */}
      <CheckoutPageTest />
    </div>
  );
}
