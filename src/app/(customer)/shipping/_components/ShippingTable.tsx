"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import { removeProduct } from "../../_actions/carts";
import { TableCell } from "@/components/ui";
import { CircleX } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redirectToPurchase } from "../../_actions/shipping";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";

function getAddressFromCookie(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith("address="))
    ?.split("=")[1];
  return raw ? JSON.parse(decodeURIComponent(raw)) : {};
}

export type ShippingFormState = {
  success: boolean;
  errors?: Record<string, string[]>;
};

export function ShippingTable() {
  const address = getAddressFromCookie();
  const t = useTranslations("ShippingPage");
  const [state, formAction, isPending] = useActionState<
    ShippingFormState,
    FormData
  >(redirectToPurchase, {
    success: false,
    errors: {},
  });

  return (
    <form action={formAction} className="space-y-6 max-w-2xl mx-auto">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">
            {t("firstName")}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            name="firstName"
            id="firstName"
            defaultValue={address.firstName || ""}
          />
          {state.errors?.firstName && (
            <div className="text-destructive">{state.errors.firstName}</div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">
            {t("lastName")}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            name="lastName"
            id="lastName"
            defaultValue={address.lastName || ""}
          />
          {state.errors?.lastName && (
            <div className="text-destructive">{state.errors.lastName}</div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">
            {t("city")}
            <span className="text-red-500">*</span>
          </Label>
          <Input name="city" id="city" defaultValue={address.city || ""} />
          {state.errors?.city && (
            <div className="text-destructive">{state.errors.city}</div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="street">
            {t("street")}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            name="street"
            id="street"
            defaultValue={address.street || ""}
          />
          {state.errors?.street && (
            <div className="text-destructive">{state.errors.street}</div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="apartment">
            {t("apartment")}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            type="number"
            name="apartment"
            id="apartment"
            defaultValue={address.apartment || ""}
          />
          {state.errors?.apartment && (
            <div className="text-destructive">{state.errors.apartment}</div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="building">
            {t("building")}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            type="number"
            name="building"
            id="building"
            defaultValue={address.building || ""}
          />
          {state.errors?.building && (
            <div className="text-destructive">{state.errors.building}</div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="floor">{t("floor")}</Label>
          <Input
            type="number"
            name="floor"
            id="floor"
            defaultValue={address.floor || ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="entry">{t("entry")}</Label>
          <Input name="entry" id="entry" defaultValue={address.entry || ""} />
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="phone">
            {t("phone")}
            <span className="text-red-500">*</span>
          </Label>
          <Input name="phone" id="phone" defaultValue={address.phone || ""} />
          {state.errors?.phone && (
            <div className="text-destructive">{state.errors.phone}</div>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="email">
            {t("email")}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            type="email"
            name="email"
            id="email"
            defaultValue={address.email || ""}
          />
          {state.errors?.email && (
            <div className="text-destructive">{state.errors.email}</div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea name="notes" id="notes" />
      </div>

      <Button type="submit" disabled={isPending} className="w-full mt-4">
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
