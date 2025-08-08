// app/components/ToastProvider.tsx
"use client";

import { Bounce, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function ToastProvider() {
  return (
    <ToastContainer
      position="top-center"
      autoClose={5000}
      transition={Bounce}
    />
  );
}
