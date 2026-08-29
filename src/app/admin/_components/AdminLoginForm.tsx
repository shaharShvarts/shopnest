"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  loginSuperAdmin,
  loginTenantAdmin,
  type AdminLoginState,
} from "../_actions/auth";

const initialState: AdminLoginState = { success: false };

export function AdminLoginForm({ mode }: { mode: "tenant" | "super" }) {
  const action = mode === "tenant" ? loginTenantAdmin : loginSuperAdmin;
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span>Email</span>
        <input className="w-full border rounded p-2" type="email" name="email" autoComplete="username" required />
      </label>
      <label className="block space-y-1">
        <span>Password</span>
        <input className="w-full border rounded p-2" type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.message && <p className="text-destructive" role="alert">{state.message}</p>}
      <LoginButton />
    </form>
  );
}

function LoginButton() {
  const { pending } = useFormStatus();
  return <Button className="w-full" type="submit" disabled={pending}>{pending ? "Signing in..." : "Login"}</Button>;
}
