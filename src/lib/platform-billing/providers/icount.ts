import "server-only";

import { z } from "zod";
import type {
  PlatformBillingCreateCheckoutInput,
  PlatformBillingCreateCheckoutResult,
  PlatformBillingProvider,
  PlatformBillingVerifyInput,
  PlatformBillingVerifyResult,
} from "../core.ts";

const API_BASE_URL = "https://api.icount.co.il/api/v3.php";
const HOSTED_CHECKOUT_ORIGIN = "https://app.icount.co.il";
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 9_000;

type Network = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type IcountPlatformBillingErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_REQUEST"
  | "PROVIDER_UNAVAILABLE"
  | "OUTCOME_UNKNOWN"
  | "INVALID_RESPONSE"
  | "INVALID_NOTIFICATION";

export class IcountPlatformBillingError extends Error {
  readonly code: IcountPlatformBillingErrorCode;
  readonly outcomeUnknown: boolean;

  constructor(code: IcountPlatformBillingErrorCode, message: string) {
    super(message);
    this.name = "IcountPlatformBillingError";
    this.code = code;
    this.outcomeUnknown = code === "OUTCOME_UNKNOWN";
  }
}

export type IcountPlatformBillingConfig = {
  apiToken: string;
  paypageId: number;
  timeoutMs?: number;
};

const generateSaleResponseSchema = z
  .object({
    status: z.literal(true),
    paypage_id: z
      .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)])
      .optional(),
    sale_uniqid: z.string().trim().min(1).max(128),
    sale_sid: z.string().trim().min(1).max(255).optional(),
    sale_url: z.string().url().max(2048),
  })
  .passthrough();

const documentInfoResponseSchema = z
  .object({
    status: z.literal(true),
    doc: z
      .object({
        doctype: z.string().trim().min(1).max(32),
        docnum: z.union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)]),
        status: z.string().trim().min(1).max(64),
        total: z.union([z.number().finite().nonnegative(), z.string().trim().min(1).max(64)]),
        currency_code: z.string().trim().length(3),
        cc_confirmation: z
          .union([z.string(), z.number().finite()])
          .optional()
          .nullable(),
      })
      .passthrough(),
  })
  .passthrough();

const notificationSchema = z
  .object({
    sale_uniqid: z.string().trim().min(1).max(128),
    doctype: z.string().trim().min(1).max(32).optional(),
    doc_type: z.string().trim().min(1).max(32).optional(),
    docnum: z
      .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)])
      .optional(),
    doc_number: z
      .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)])
      .optional(),
  })
  .passthrough();

const saleReferencePattern = /^sale:([A-Za-z0-9._-]{1,128})$/;
const documentReferencePattern =
  /^doc:([A-Za-z0-9._-]{1,128}):([A-Za-z0-9_-]{1,32}):([1-9][0-9]*)$/;

function invalidResponse(message = "Invalid iCount response"): never {
  throw new IcountPlatformBillingError("INVALID_RESPONSE", message);
}

function validateExpectedMoney(amountMinor: number, currency: string) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || currency !== "ILS") {
    throw new IcountPlatformBillingError(
      "INVALID_REQUEST",
      "iCount platform billing accepts positive ILS amounts only"
    );
  }
}

function minorToMajor(amountMinor: number): number {
  validateExpectedMoney(amountMinor, "ILS");
  return Number((amountMinor / 100).toFixed(2));
}

function majorToMinor(value: number | string): number {
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : ""
      : value.trim();

  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(text);
  if (!match) invalidResponse("Invalid iCount amount");

  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const minor = whole * 100 + Number(fraction || "0");

  if (!Number.isSafeInteger(minor) || minor < 0) {
    invalidResponse("Invalid iCount amount");
  }

  return minor;
}

function validatedHostedCheckoutUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidResponse("Invalid iCount hosted checkout URL");
  }

  if (
    url.origin !== HOSTED_CHECKOUT_ORIGIN ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/m/")
  ) {
    return invalidResponse("Untrusted iCount hosted checkout URL");
  }

  return url.toString();
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.ok) invalidResponse("iCount returned a non-success HTTP status");

  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RESPONSE_BYTES
  ) {
    invalidResponse("iCount response exceeded the size limit");
  }

  if (!response.body) invalidResponse();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        invalidResponse("iCount response exceeded the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalidResponse();
  }
}

function parseSaleReference(reference: string): string | null {
  return saleReferencePattern.exec(reference)?.[1] ?? null;
}

function parseDocumentReference(reference: string) {
  const match = documentReferencePattern.exec(reference);
  if (!match) return null;

  const docnum = Number(match[3]);
  if (!Number.isSafeInteger(docnum) || docnum <= 0) return null;

  return {
    saleUniqid: match[1],
    doctype: match[2],
    docnum,
  };
}

export function icountDocumentReferenceFromNotification(
  expectedSaleReference: string,
  input: unknown
): string {
  const expectedSaleUniqid = parseSaleReference(expectedSaleReference);
  if (!expectedSaleUniqid) {
    throw new IcountPlatformBillingError(
      "INVALID_NOTIFICATION",
      "Expected iCount sale reference is invalid"
    );
  }

  const parsed = notificationSchema.safeParse(input);
  if (!parsed.success || parsed.data.sale_uniqid !== expectedSaleUniqid) {
    throw new IcountPlatformBillingError(
      "INVALID_NOTIFICATION",
      "iCount notification does not match the billing attempt"
    );
  }

  const doctype = parsed.data.doctype ?? parsed.data.doc_type;
  const rawDocnum = parsed.data.docnum ?? parsed.data.doc_number;
  const docnum = typeof rawDocnum === "string" ? Number(rawDocnum) : rawDocnum;

  if (
    !doctype ||
    !/^[A-Za-z0-9_-]{1,32}$/.test(doctype) ||
    !Number.isSafeInteger(docnum) ||
    !docnum ||
    docnum <= 0
  ) {
    throw new IcountPlatformBillingError(
      "INVALID_NOTIFICATION",
      "iCount notification is missing a valid document reference"
    );
  }

  return `doc:${expectedSaleUniqid}:${doctype}:${docnum}`;
}

export class IcountPlatformBillingProvider implements PlatformBillingProvider {
  readonly id = "icount";

  private readonly apiToken: string;
  private readonly paypageId: number;
  private readonly timeoutMs: number;
  private readonly network: Network;

  constructor(config: IcountPlatformBillingConfig, network: Network = fetch) {
    const token = config.apiToken?.trim();
    if (!token || token.length > 2048) {
      throw new IcountPlatformBillingError(
        "NOT_CONFIGURED",
        "iCount API token is not configured"
      );
    }
    if (!Number.isSafeInteger(config.paypageId) || config.paypageId <= 0) {
      throw new IcountPlatformBillingError(
        "NOT_CONFIGURED",
        "iCount PayPage ID is not configured"
      );
    }

    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      throw new IcountPlatformBillingError(
        "NOT_CONFIGURED",
        "iCount timeout configuration is invalid"
      );
    }

    this.apiToken = token;
    this.paypageId = config.paypageId;
    this.timeoutMs = timeoutMs;
    this.network = network;
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
    options: { mutating?: boolean } = {}
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.network(`${API_BASE_URL}${path}`, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (options.mutating && response.status >= 500) {
          throw new IcountPlatformBillingError(
            "OUTCOME_UNKNOWN",
            "iCount checkout outcome is unknown and must not be retried"
          );
        }
        invalidResponse("iCount returned a non-success HTTP status");
      }

      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof IcountPlatformBillingError) throw error;
      throw new IcountPlatformBillingError(
        options.mutating ? "OUTCOME_UNKNOWN" : "PROVIDER_UNAVAILABLE",
        options.mutating
          ? "iCount checkout outcome is unknown and must not be retried"
          : "iCount request could not be completed safely"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async createCheckout(
    input: PlatformBillingCreateCheckoutInput
  ): Promise<PlatformBillingCreateCheckoutResult> {
    validateExpectedMoney(input.amountMinor, input.currency);

    if (
      !Number.isSafeInteger(input.attemptId) ||
      input.attemptId <= 0 ||
      !input.externalReference ||
      input.externalReference.length > 128
    ) {
      throw new IcountPlatformBillingError(
        "INVALID_REQUEST",
        "Invalid platform billing attempt"
      );
    }

    const response = generateSaleResponseSchema.safeParse(
      await this.request("/paypage/generate_sale", {
        paypage_id: this.paypageId,
        sum: minorToMajor(input.amountMinor),
        description: `ShopNest platform billing ${input.externalReference}`,
        currency_code: "ILS",
        max_payments: 1,
      }, {
        mutating: true,
      })
    );

    if (!response.success) invalidResponse();

    if (
      response.data.paypage_id !== undefined &&
      Number(response.data.paypage_id) !== this.paypageId
    ) {
      invalidResponse("iCount PayPage reference mismatch");
    }

    return {
      providerReference: `sale:${response.data.sale_uniqid}`,
      redirectUrl: validatedHostedCheckoutUrl(response.data.sale_url),
      amountMinor: input.amountMinor,
      currency: input.currency,
    };
  }

  async verifyResult(
    input: PlatformBillingVerifyInput
  ): Promise<PlatformBillingVerifyResult> {
    validateExpectedMoney(input.expectedAmountMinor, input.expectedCurrency);

    const saleUniqid = parseSaleReference(input.providerReference);
    if (saleUniqid) {
      return {
        providerReference: input.providerReference,
        status: "pending",
        amountMinor: input.expectedAmountMinor,
        currency: input.expectedCurrency,
      };
    }

    const document = parseDocumentReference(input.providerReference);
    if (!document) {
      throw new IcountPlatformBillingError(
        "INVALID_REQUEST",
        "Invalid iCount provider reference"
      );
    }

    const response = documentInfoResponseSchema.safeParse(
      await this.request("/doc/info", {
        doctype: document.doctype,
        docnum: document.docnum,
        get_payments: true,
      })
    );

    if (!response.success) invalidResponse();

    if (
      response.data.doc.doctype !== document.doctype ||
      Number(response.data.doc.docnum) !== document.docnum
    ) {
      invalidResponse("iCount document reference mismatch");
    }

    const observedAmountMinor = majorToMinor(response.data.doc.total);
    const observedCurrency = response.data.doc.currency_code.toUpperCase();

    if (
      observedAmountMinor !== input.expectedAmountMinor ||
      observedCurrency !== input.expectedCurrency
    ) {
      return {
        providerReference: input.providerReference,
        status: "review_required",
        amountMinor: observedAmountMinor,
        currency: observedCurrency,
      };
    }

    const status = response.data.doc.status.toLowerCase();
    let normalizedStatus: PlatformBillingVerifyResult["status"];

    if (status === "closed") {
      // Fail closed until iCount's authoritative paid/confirmation semantics are
      // verified against current official provider documentation and sandbox evidence.
      normalizedStatus = "review_required";
    } else if (status === "cancelled" || status === "canceled") {
      normalizedStatus = "cancelled";
    } else if (
      status === "open" ||
      status === "pending" ||
      status === "created" ||
      status === "draft"
    ) {
      normalizedStatus = "pending";
    } else {
      normalizedStatus = "review_required";
    }

    return {
      providerReference: input.providerReference,
      status: normalizedStatus,
      amountMinor: observedAmountMinor,
      currency: observedCurrency,
    };
  }
}

export function createIcountPlatformBillingProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  network: Network = fetch
): IcountPlatformBillingProvider {
  const apiToken = env.PLATFORM_BILLING_ICOUNT_API_TOKEN?.trim();
  const rawPaypageId = env.PLATFORM_BILLING_ICOUNT_PAYPAGE_ID?.trim();

  if (!apiToken || !rawPaypageId || !/^[1-9][0-9]*$/.test(rawPaypageId)) {
    throw new IcountPlatformBillingError(
      "NOT_CONFIGURED",
      "iCount platform billing is not configured"
    );
  }

  const paypageId = Number(rawPaypageId);
  if (!Number.isSafeInteger(paypageId) || paypageId <= 0) {
    throw new IcountPlatformBillingError(
      "NOT_CONFIGURED",
      "iCount PayPage ID is not configured"
    );
  }

  return new IcountPlatformBillingProvider(
    {
      apiToken,
      paypageId,
    },
    network
  );
}
