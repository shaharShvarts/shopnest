"use client";

import { useEffect, useState } from "react";
import { getCartCount } from "../_actions/getCartCount";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/context/CartContext";

export const CartIcon = () => {
  const { items } = useCart();
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const now = new Date(Date.now());
    const validItems = items.filter((item) => item.expiresAt > now);
    const totalQty = validItems.reduce((sum, item) => sum + item.quantity, 0);
    setActiveCount(totalQty);
  }, [items]);

  return (
    <div className="relative transition-colors" aria-label="View shopping cart">
      <ShoppingCart className="text-gray-800 hover:text-rose-800" />
      {activeCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full px-2 text-xs">
          {activeCount}
        </span>
      )}
    </div>
  );
};
