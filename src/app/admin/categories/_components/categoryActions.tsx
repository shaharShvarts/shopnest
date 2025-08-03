"use client";

import { DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { useTransition } from "react";
import {
  deleteCategory,
  ToggleCategoryActive,
} from "../../_actions/categories";
import { useRouter } from "next/navigation";

type ActiveToggleDropdownItemProps = {
  id: number;
  active: boolean;
};

export function ActiveToggleDropdownItem({
  id,
  active,
}: ActiveToggleDropdownItemProps) {
  // This function will handle the toggle action
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <DropdownMenuItem
      asChild
      disabled={isPending}
      //   className="w-full text-left"
      onClick={() => {
        startTransition(async () => {
          await ToggleCategoryActive(id, !active);
          router.refresh();
        });
      }}
    >
      <div className="outline-none hover:bg-gray-100 cursor-pointer text-sm px-2 py-1.5 w-full text-left transition-colors">
        {active ? "Deactivate" : "Activate"}
      </div>
    </DropdownMenuItem>
  );
}

type DeleteDropdownItemProps = {
  id: number;
  disabled: boolean;
};

export function DeleteDropdownItem({ id, disabled }: DeleteDropdownItemProps) {
  // This function will handle the delete action
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <DropdownMenuItem
      className="text-red-500 focus:bg-red-500 focus:text-white focus:rounded-md blur:rounded-md"
      asChild
      disabled={disabled || isPending}
      onClick={() => {
        startTransition(async () => {
          await deleteCategory(id);
          router.refresh();
        });
      }}
    >
      <div className="outline-none hover:bg-gray-100 cursor-pointer text-sm px-2 py-1.5 w-full text-left transition-colors">
        Delete
      </div>
    </DropdownMenuItem>
  );
}
