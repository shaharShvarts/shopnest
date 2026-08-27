import { PageHeader } from "@/app/components/PageHeader";
import { randomUUID } from "node:crypto";
import CheckoutTable from "./_components/CheckoutTable";

export default function CheckoutPage() {
  return (
    <div>
      <PageHeader>Secure Checkout</PageHeader>
      <CheckoutTable submissionToken={randomUUID()} />
    </div>
  );
}
