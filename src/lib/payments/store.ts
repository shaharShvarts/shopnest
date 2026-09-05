import type { PaymentAttempt, PaymentOrder, PaymentSettings } from "./types.ts";

export interface PaymentTransaction {
  lockOrder(id: number): Promise<PaymentOrder | null>;
  getSettings(): Promise<PaymentSettings | null>;
  findAttemptForOrder(orderId: number): Promise<PaymentAttempt | null>;
  getAttempt(id: string): Promise<PaymentAttempt | null>;
  insertAttempt(attempt: PaymentAttempt): Promise<void>;
  updateAttempt(attempt: PaymentAttempt): Promise<void>;
  reservationValid(order: PaymentOrder): Promise<boolean>;
  consumeInventory(order: PaymentOrder): Promise<void>;
  releaseInventory(order: PaymentOrder): Promise<void>;
  markOrderPaid(orderId: number, provider: string): Promise<void>;
}

export interface PaymentStore {
  readonly tenant: string;
  transaction<T>(callback: (tx: PaymentTransaction) => Promise<T>): Promise<T>;
  getAttempt(id: string): Promise<PaymentAttempt | null>;
}
