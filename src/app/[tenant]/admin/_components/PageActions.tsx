"use client";

import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "react-toastify";

type ActiveToggleDropdownItemProps = {
  id: number;
  active: boolean;
  f: (id: number, active: boolean) => Promise<void>;
};

export function ActiveToggleDropdownItem({
  id,
  active,
  f,
}: ActiveToggleDropdownItemProps) {
  // This function will handle the toggle action
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <DropdownMenuItem asChild>
      <div className="text-foreground rounded-sm w-full text-left px-2 py-1.5 hover:bg-gray-100 text-sm cursor-pointer outline-none transition-colors">
        <button
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await f(id, !active);
              router.refresh();
            });
          }}
        >
          {active ? "Deactivate" : "Activate"}
        </button>
      </div>
    </DropdownMenuItem>
  );
}

type DeleteDropdownItemProps = {
  id: number;
  disabled: boolean;
  f: (id: number) => Promise<string>;
};

export function DeleteDropdownItem({
  id,
  disabled,
  f,
}: DeleteDropdownItemProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <DropdownMenuItem asChild>
      <button
        onClick={() => {
          if (disabled || isPending)
            return toast.warning(
              "Cannot be deleted as long as something is associated!"
            );

          startTransition(async () => {
            const message = await f(id);
            router.refresh();
            toast.info(message);
          });
        }}
        className="text-red-500 rounded-sm outline-none focus:text-gray-100 focus:bg-red-500 cursor-pointer text-sm px-2 py-1.5 w-full text-left transition-colors"
      >
        Delete
      </button>
    </DropdownMenuItem>
  );
}
