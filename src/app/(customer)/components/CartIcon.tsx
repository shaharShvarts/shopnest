"use client";

import { useEffect } from "react";
import { getCartCount } from "../_actions/getCartCount";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/context/CartContext";

export const CartIcon = () => {
  const { cartCount, setCartCount } = useCart();

  useEffect(() => {
    (async () => {
      const count = await getCartCount();
      setCartCount(count);
    })();
  }, []);

  return (
    <div className="relative transition-colors" aria-label="View shopping cart">
      <ShoppingCart className="text-gray-800 hover:text-rose-800" />
      {cartCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full px-2 text-xs">
          {cartCount}
        </span>
      )}
    </div>
  );
};
