"use client";

// import { useEffect } from "react";
// import { getCartCount } from "../_actions/getCartCount";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/context/CartContext";

export const CartIcon = () => {
  const { cartCount } = useCart();

  // useEffect(() => {
  //   (async () => {
  //     const count = await getCartCount();
  //     setCartCount(count);
  //   })();
  // }, []);

  return (
    <div className="relative transition-colors">
      <ShoppingCart className="text-gray-800 hover:text-rose-800" />
      {cartCount > 0 && (
        <span className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] leading-none text-white">
          {cartCount}
        </span>
      )}
    </div>
  );
};
