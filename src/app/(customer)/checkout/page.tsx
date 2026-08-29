import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import { randomUUID } from "node:crypto";
import CheckoutTable from "./_components/CheckoutTable";

export default function CheckoutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <StorefrontPageHeader>Secure Checkout</StorefrontPageHeader>
      <CheckoutTable submissionToken={randomUUID()} />
    </div>
  );
}
