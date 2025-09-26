"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";
import { ProductPreview } from "../(customer)/types";
import { useTranslations } from "next-intl";
import { useState } from "react";

const reserveProduct = async (productId: number) => {
  const res = await fetch("/api/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });

  if (!res.ok) {
    if (res.status === 409) return "Not enough stock";
    const errorData = await res.json();
    console.log("Backend error:", errorData);

    throw new Error(errorData.error || "Reservation failed");
  }

  return res.json();
};

export function ProductCard({
  id,
  name,
  price,
  imageUrl,
  description,
}: ProductPreview) {
  const t = useTranslations("ProductsPage");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  return (
    <Card className="flex overflow-hidden flex-col">
      <div className="relative w-full aspect-video">
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-300 hover:scale-105"
          sizes="100vw"
        />
      </div>
      <CardHeader className="text-lg font-semibold">
        <CardTitle>{name}</CardTitle>
        <CardDescription>{formatCurrency(price)}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="line-clamp-4">{description}</p>
      </CardContent>
      <CardFooter>
        <Button
          size="lg"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await reserveProduct(id);
              router.push(`/products/${id}/details`);
            } catch (error) {
              const err = error as Error;
              console.log(err.message || "Reservation error");
              alert(
                err.message || "Failed to reserve product. Please try again."
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          {t("button")}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ProductCardSkeleton() {
  return (
    <Card className="flex overflow-hidden flex-col animate-pulse">
      <div className="w-full aspect-video bg-gray-300" />
      <CardHeader>
        <CardTitle>
          <div className="w-3/4 h-6 rounded-full bg-gray-300" />
        </CardTitle>
        <CardDescription>
          <div className="w-1/2 h-4 rounded-full bg-gray-300" />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="w-full h-4 rounded-full bg-gray-300" />
        <div className="w-full h-4 rounded-full bg-gray-300" />
        <div className="w-full h-4 rounded-full bg-gray-300" />
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled size="lg"></Button>
      </CardFooter>
    </Card>
  );
}
