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
    <button
      className="relative rounded-full transition-colors px-4 hover:bg-accent hover:text-accent-foreground"
      aria-label="View shopping cart"
    >
      <ShoppingCart />
      {cartCount > 0 && (
        <span className="absolute top-2 right-0 bg-red-500 text-white rounded-full px-2 text-xs">
          {cartCount}
        </span>
      )}
    </button>
  );
};
