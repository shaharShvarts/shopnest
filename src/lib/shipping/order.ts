export type ShippingSortUpdate = {
  id: number;
  sortOrder: number;
};

export interface ShippingOrderStore {
  listMethodIds(): Promise<number[]>;
  updateSortOrders(updates: ShippingSortUpdate[]): Promise<void>;
}

export class ShippingOrderError extends Error {
  readonly code: "invalid_order" | "duplicate_method" | "unknown_method";

  constructor(
    code: "invalid_order" | "duplicate_method" | "unknown_method",
    message: string
  ) {
    super(message);
    this.name = "ShippingOrderError";
    this.code = code;
  }
}

export function getNextShippingSortOrder(sortOrders: number[]) {
  if (sortOrders.length === 0) return 0;
  if (sortOrders.some((value) => !Number.isSafeInteger(value))) {
    throw new ShippingOrderError(
      "invalid_order",
      "Existing shipping order is invalid."
    );
  }
  return Math.max(...sortOrders) + 1;
}

export async function reorderShippingMethods(
  store: ShippingOrderStore,
  orderedIds: number[]
) {
  if (
    orderedIds.some(
      (id) => !Number.isSafeInteger(id) || id <= 0
    )
  ) {
    throw new ShippingOrderError(
      "invalid_order",
      "Shipping method order is invalid."
    );
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new ShippingOrderError(
      "duplicate_method",
      "Shipping method order contains duplicate IDs."
    );
  }

  const currentIds = await store.listMethodIds();
  const currentSet = new Set(currentIds);
  if (
    currentIds.length !== orderedIds.length ||
    orderedIds.some((id) => !currentSet.has(id))
  ) {
    throw new ShippingOrderError(
      "unknown_method",
      "Shipping method order contains an unknown method."
    );
  }

  const updates = orderedIds.map((id, sortOrder) => ({ id, sortOrder }));
  await store.updateSortOrders(updates);
  return updates;
}

export function moveShippingMethod<T extends { id: number }>(
  methods: T[],
  activeId: number,
  overId: number
) {
  const activeIndex = methods.findIndex((method) => method.id === activeId);
  const overIndex = methods.findIndex((method) => method.id === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return methods;
  }

  const reordered = [...methods];
  const [activeMethod] = reordered.splice(activeIndex, 1);
  reordered.splice(overIndex, 0, activeMethod);
  return reordered;
}
