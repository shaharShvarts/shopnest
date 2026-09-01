import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import { randomUUID } from "node:crypto";
import CheckoutTable from "./_components/CheckoutTable";
import { getCurrentCustomer } from "@/lib/customer-auth/server";

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <StorefrontPageHeader>Secure Checkout</StorefrontPageHeader>
      <CheckoutTable
        submissionToken={randomUUID()}
        customer={
          customer
            ? { email: customer.email, displayName: customer.displayName }
            : null
        }
      />
    </div>
  );
}
