import { z } from "zod";
import type { StoreLifecycleStatus } from "../store-lifecycle/core.ts";
import { STORE_RESERVED_ROUTE_SEGMENTS } from "../tenant-routing/core.ts";
import { normalizeTenantSlug } from "../tenant-validation.mjs";

export const STORE_DELETE_UNDO_MS = 10_000;

export type StoreSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; reason: "invalid" | "reserved" };

export function validateStoreSlug(value: unknown): StoreSlugValidation {
  if (typeof value !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const slug = value.trim().toLowerCase();
  const normalized = normalizeTenantSlug(slug);

  if (!normalized || normalized.slug !== slug) {
    return { ok: false, reason: "invalid" };
  }

  if (STORE_RESERVED_ROUTE_SEGMENTS.has(slug)) {
    return { ok: false, reason: "reserved" };
  }

  return { ok: true, slug };
}

const storeSlugSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .superRefine((slug, context) => {
    const validation = validateStoreSlug(slug);

    if (!validation.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          validation.reason === "reserved"
            ? "reserved_store_slug"
            : "invalid_store_slug",
      });
    }
  });

export const storeProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    slug: storeSlugSchema,
  })
  .strip();

export type StoreProfile = z.infer<typeof storeProfileSchema>;

export type MerchantStoreStatus = StoreLifecycleStatus;

export type MerchantStore = {
  id: number;
  organizationId: number;
  displayName: string;
  slug: string;
  status: MerchantStoreStatus;
  tenantId: number | null;
  deletedAt: Date | null;
  deleteFinalizesAt: Date | null;
  slugReleasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parseStoreProfile(input: unknown): StoreProfile {
  const parsed = storeProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("invalid_store_profile");
  }
  return parsed.data;
}

export function suggestStoreSlug(displayName: string) {
  const parts = displayName.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return parts.join("-").slice(0, 63).replace(/-+$/g, "");
}

export function parseStoreId(value: unknown) {
  const parsed = z.coerce.number().int().positive().safeParse(value);
  if (!parsed.success) {
    throw new Error("invalid_store_id");
  }
  return parsed.data;
}

export function parseStoreVersion(value: unknown) {
  const parsed = z.string().datetime({ offset: true }).safeParse(value);
  if (!parsed.success) {
    throw new Error("invalid_store_version");
  }

  const date = new Date(parsed.data);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_store_version");
  }

  return date;
}

export function nextStoreVersion(current: Date, now = new Date()) {
  return new Date(Math.max(now.getTime(), current.getTime() + 1));
}


export type StoreErrorCode =
  | "ORGANIZATION_REQUIRED"
  | "NOT_FOUND"
  | "SLUG_UNAVAILABLE"
  | "SLUG_LOCKED"
  | "CONFLICT"
  | "TENANT_LINKED"
  | "UNDO_EXPIRED";

export class MerchantStoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MerchantStoreError";
  }
}

export type DeleteStoreResult = {
  store: MerchantStore;
  undoVersion: string;
  undoExpiresAt: string;
};

export interface MerchantStoreRepository {
  listForMerchant(merchantId: number): Promise<MerchantStore[]>;
  findOwnedById(
    merchantId: number,
    storeId: number
  ): Promise<MerchantStore | null>;
  createDraftForMerchant(
    merchantId: number,
    profile: StoreProfile,
    now?: Date
  ): Promise<MerchantStore>;
  updateOwned(
    merchantId: number,
    storeId: number,
    profile: StoreProfile,
    expectedUpdatedAt: Date,
    now?: Date
  ): Promise<MerchantStore>;
  isSlugAvailable(
    merchantId: number,
    slug: string,
    currentStoreId?: number,
    now?: Date
  ): Promise<boolean>;
  softDeleteOwned(
    merchantId: number,
    storeId: number,
    expectedUpdatedAt: Date,
    now?: Date
  ): Promise<DeleteStoreResult>;
  undoDeleteOwned(
    merchantId: number,
    storeId: number,
    expectedUpdatedAt: Date,
    now?: Date
  ): Promise<MerchantStore>;
}
