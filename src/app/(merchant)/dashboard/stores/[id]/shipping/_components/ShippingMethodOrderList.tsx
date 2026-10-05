"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "react-toastify";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ManagementSwitch } from "@/components/management/ManagementSwitch";
import {
  reorderManagedShippingMethods,
  toggleManagedShippingMethod,
} from "../../_actions/shipping";

type ShippingMethodListItem = {
  id: number;
  name: string;
  price: number;
  requiresAddress: boolean;
  isActive: boolean;
  logoUrl: string | null;
};

export function ShippingMethodOrderList({
  storeId,
  initialMethods,
}: {
  storeId: number;
  initialMethods: ShippingMethodListItem[];
}) {
  const t = useTranslations("StoreShippingManagement");
  const router = useRouter();
  const [methods, setMethods] = useState(initialMethods);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || pending) return;

    const oldIndex = methods.findIndex((method) => method.id === active.id);
    const newIndex = methods.findIndex((method) => method.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = methods;
    const next = arrayMove(methods, oldIndex, newIndex);
    setMethods(next);

    startTransition(async () => {
      try {
        const result = await reorderManagedShippingMethods(
          storeId,
          next.map((method) => method.id)
        );

        if (!result.ok) {
          setMethods(previous);
          toast.error(t("reorderFailed"));
          return;
        }

        toast.success(t("orderSaved"));
        router.refresh();
      } catch {
        setMethods(previous);
        toast.error(t("reorderFailed"));
      }
    });
  }

  function toggleMethod(methodId: number, active: boolean) {
    if (pending) return;

    const previous = methods;
    setMethods((current) =>
      current.map((method) =>
        method.id === methodId ? { ...method, isActive: active } : method
      )
    );

    startTransition(async () => {
      try {
        const result = await toggleManagedShippingMethod(
          storeId,
          methodId,
          active
        );

        if (!result.ok) {
          setMethods(previous);
          toast.error(t("statusSaveFailed"));
          return;
        }

        toast.success(t("statusSaved"));
        router.refresh();
      } catch {
        setMethods(previous);
        toast.error(t("statusSaveFailed"));
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={methods.map((method) => method.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="divide-y divide-border">
          {methods.map((method) => (
            <SortableShippingMethodRow
              key={method.id}
              storeId={storeId}
              method={method}
              pending={pending}
              onToggle={toggleMethod}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableShippingMethodRow({
  storeId,
  method,
  pending,
  onToggle,
}: {
  storeId: number;
  method: ShippingMethodListItem;
  pending: boolean;
  onToggle: (methodId: number, active: boolean) => void;
}) {
  const t = useTranslations("StoreShippingManagement");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: method.id,
    disabled: pending,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={
        "flex items-center gap-3 p-4 transition-shadow " +
        (isDragging ? "relative z-10 bg-background shadow-lg" : "bg-background")
      }
    >
      <button
        type="button"
        aria-label={t("reorderMethod", { name: method.name })}
        disabled={pending}
        className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" />
      </button>

      {method.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={method.logoUrl}
          alt=""
          className="size-12 shrink-0 rounded-lg border border-border object-contain"
        />
      ) : (
        <div
          aria-hidden="true"
          className="size-12 shrink-0 rounded-lg border border-dashed border-border bg-muted/30"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{method.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          ₪{method.price} ·{" "}
          {method.requiresAddress
            ? t("addressRequired")
            : t("addressNotRequired")}
        </p>
      </div>

      <ManagementSwitch
        checked={method.isActive}
        disabled={pending}
        label={t("availabilityFor", { name: method.name })}
        onCheckedChange={(checked) => onToggle(method.id, checked)}
      />

      <Button asChild variant="outline" size="management">
        <Link href={`/dashboard/stores/${storeId}/shipping/${method.id}/edit`}>
          {t("edit")}
        </Link>
      </Button>
    </li>
  );
}
