"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TenantLink } from "@/components/TenantLink";
import type { ShippingMethod } from "@/lib/shipping/core";
import {
  reorderShippingMethodAction,
  toggleShippingMethod,
  type ReorderShippingState,
} from "../../_actions/shipping";

const initialState: ReorderShippingState = { success: false };

export function ShippingMethodOrderList({
  methods,
}: {
  methods: ShippingMethod[];
}) {
  const [orderedMethods, setOrderedMethods] = useState(methods);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [state, formAction] = useActionState(
    reorderShippingMethodAction,
    initialState
  );

  useEffect(() => {
    setOrderedMethods(methods);
  }, [methods]);

  useEffect(() => {
    if (state.success) setDirty(false);
  }, [state]);

  function moveDraggedTo(targetId: number) {
    if (draggedId === null || draggedId === targetId) return;
    setOrderedMethods((current) => {
      const sourceIndex = current.findIndex((method) => method.id === draggedId);
      const originalTargetIndex = current.findIndex(
        (method) => method.id === targetId
      );
      const dragged = current.find((method) => method.id === draggedId);
      if (!dragged) return current;
      const withoutDragged = current.filter((method) => method.id !== draggedId);
      let targetIndex = withoutDragged.findIndex(
        (method) => method.id === targetId
      );
      if (targetIndex < 0) return current;
      if (sourceIndex < originalTargetIndex) targetIndex += 1;
      withoutDragged.splice(targetIndex, 0, dragged);
      return withoutDragged;
    });
    setDirty(true);
  }

  function moveFromPointer(clientX: number, clientY: number) {
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-shipping-method-id]");
    const targetId = Number(target?.dataset.shippingMethodId);
    if (Number.isSafeInteger(targetId)) moveDraggedTo(targetId);
  }

  return (
    <form action={formAction} className="space-y-4">
      <input
        type="hidden"
        name="orderedIds"
        value={JSON.stringify(orderedMethods.map((method) => method.id))}
      />
      <div className="grid gap-3">
        {orderedMethods.map((method) => (
          <article
            key={method.id}
            data-shipping-method-id={method.id}
            onDragEnter={() => moveDraggedTo(method.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setDraggedId(null);
            }}
            className={`grid gap-3 rounded-xl border p-4 transition sm:grid-cols-[auto_1fr_auto] sm:items-center ${
              draggedId === method.id ? "opacity-60 ring-2 ring-primary/30" : ""
            }`}
          >
            <button
              type="button"
              draggable
              aria-label={`Drag to reorder ${method.name}`}
              title="Drag to reorder"
              className="flex size-11 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
              onDragStart={(event) => {
                setDraggedId(method.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(method.id));
              }}
              onDragEnd={() => setDraggedId(null)}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") return;
                setDraggedId(method.id);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  moveFromPointer(event.clientX, event.clientY);
                }
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                setDraggedId(null);
              }}
              onPointerCancel={() => setDraggedId(null)}
            >
              <GripVertical className="size-5" aria-hidden="true" />
            </button>
            <div>
              <h2 className="font-semibold">{method.name}</h2>
              <p className="text-sm text-muted-foreground">
                {method.type.replaceAll("_", " ")} · ₪{method.price} ·{" "}
                {method.freeShippingThreshold == null
                  ? "No free threshold"
                  : `Free from ₪${method.freeShippingThreshold}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <TenantLink href={`/admin/shipping/${method.id}/edit`}>
                  Edit
                </TenantLink>
              </Button>
              <Button
                type="submit"
                formAction={toggleShippingMethod.bind(
                  null,
                  method.id,
                  !method.isActive
                )}
                variant={method.isActive ? "secondary" : "default"}
              >
                {method.isActive ? "Disable" : "Enable"}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SaveOrderButton disabled={!dirty} />
        {state.message && (
          <p
            role="status"
            className={`text-sm ${
              state.success ? "text-green-700" : "text-destructive"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function SaveOrderButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Saving order..." : "Save Order"}
    </Button>
  );
}
