"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";

type CartItem = {
  productId: number;
  quantity: number;
  expiresAt: Date;
};

type CartContextType = {
  items: CartItem[];
  addToCartContext: (item: CartItem) => void;
  removeFromCartContext: (productId: number) => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("cart");
    if (stored) {
      const parsed = JSON.parse(stored) as CartItem[];
      const now = new Date(Date.now());
      const valid = parsed.filter((item) => item.expiresAt > now);
      setItems(valid);
    }
  }, []);

  // Save to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const addToCartContext = (item: CartItem) => {
    setItems((prev) => [...prev, item]);
  };

  const removeFromCartContext = (productId: number) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  return (
    <CartContext.Provider
      value={{ items, addToCartContext, removeFromCartContext }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
