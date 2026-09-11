"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TenantLink } from "@/components/TenantLink";
import type { ShippingMethod } from "@/lib/shipping/core";
import { moveShippingMethod } from "@/lib/shipping/order";
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
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [state, formAction] = useActionState(
    reorderShippingMethodAction,
    initialState
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setOrderedMethods(methods);
  }, [methods]);

  useEffect(() => {
    if (state.success) setDirty(false);
  }, [state]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over || event.active.id === event.over.id) return;
    setOrderedMethods((current) =>
      moveShippingMethod(current, Number(event.active.id), Number(event.over!.id))
    );
    setDirty(true);
  }

  const activeMethod =
    orderedMethods.find((method) => method.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <DndContext
        id="shipping-method-order"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedMethods.map((method) => method.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-3">
            {orderedMethods.map((method) => (
              <SortableShippingMethod key={method.id} method={method} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeMethod ? (
            <ShippingMethodSummary method={activeMethod} overlay />
          ) : null}
        </DragOverlay>
      </DndContext>
      <form action={formAction}>
        <input
          type="hidden"
          name="orderedIds"
          value={JSON.stringify(orderedMethods.map((method) => method.id))}
        />
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
    </div>
  );
}

function SortableShippingMethod({ method }: { method: ShippingMethod }) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: method.id });

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center ${
        isDragging ? "opacity-30 ring-2 ring-primary/40" : ""
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Drag to reorder ${method.name}`}
        title="Drag to reorder"
        className="flex size-11 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
      <ShippingMethodDetails method={method} />
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <TenantLink href={`/admin/shipping/${method.id}/edit`}>
            Edit
          </TenantLink>
        </Button>
        <form
          action={toggleShippingMethod.bind(null, method.id, !method.isActive)}
        >
          <Button
            type="submit"
            variant={method.isActive ? "secondary" : "default"}
          >
            {method.isActive ? "Disable" : "Enable"}
          </Button>
        </form>
      </div>
    </article>
  );
}

function ShippingMethodSummary({
  method,
  overlay = false,
}: {
  method: ShippingMethod;
  overlay?: boolean;
}) {
  return (
    <article
      className={`grid gap-3 rounded-xl border bg-background p-4 shadow-lg sm:grid-cols-[auto_1fr] sm:items-center ${
        overlay ? "cursor-grabbing ring-2 ring-primary/40" : ""
      }`}
    >
      <span className="flex size-11 items-center justify-center text-muted-foreground">
        <GripVertical className="size-5" aria-hidden="true" />
      </span>
      <ShippingMethodDetails method={method} />
    </article>
  );
}

function ShippingMethodDetails({ method }: { method: ShippingMethod }) {
  return (
    <div>
      <h2 className="font-semibold">{method.name}</h2>
      <p className="text-sm text-muted-foreground">
        {method.type.replaceAll("_", " ")} · ₪{method.price} ·{" "}
        {method.freeShippingThreshold == null
          ? "No free threshold"
          : `Free from ₪${method.freeShippingThreshold}`}
      </p>
    </div>
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
