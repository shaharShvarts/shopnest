import "server-only";
import { PaymentError, type PaymentAttempt, type PaymentEnvironment, type PaymentProvider } from "../types.ts";
import { credentialsSchema, assertCardcomTestConfiguration } from "./cardcom.ts";
import { CardcomNumber, parseCardcomJson } from "./cardcom-json.ts";

const api = "https://secure.cardcom.solutions/api/v11/LowProfile/";
const maxBytes = 256 * 1024;
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (): never => { throw new PaymentError("cardcom_invalid_response"); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof CardcomNumber) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown): bigint {
  if (!(value instanceof CardcomNumber) || value.text.length > 11 || !/^-?(?:0|[1-9][0-9]*)$/.test(value.text)) return invalid();
  const result = BigInt(value.text);
  if (result < BigInt("-2147483648") || result > BigInt("2147483647")) return invalid();
  return result;
}
export function cardcomChargeId(value: unknown): string {
  if (!(value instanceof CardcomNumber) || !/^[1-9][0-9]{0,18}$/.test(value.text) || BigInt(value.text) > BigInt("9223372036854775807")) return invalid();
  return value.text;
}
function profile(value: unknown): string {
  if (typeof value !== "string" || !guid.test(value) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)) return invalid();
  return value.toLowerCase();
}
export function cardcomAmount(amount: number, currency: string): string {
  if (currency !== "ILS") throw new PaymentError("cardcom_unsupported_currency");
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new PaymentError("invalid_amount");
  return `${amount}.00`; // ShopNest integer major units; no multiplication/division.
}
function matchesAmount(value: unknown, amount: number): boolean {
  if (!(value instanceof CardcomNumber) || value.text.length > 20 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value.text)) return false;
  const [whole, fraction = ""] = value.text.split(".");
  return BigInt(whole) === BigInt(amount) && /^0*$/.test(fraction);
}
export function cardcomHostedUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096 || !value.startsWith("https://") || /[\s\\\u0000-\u001f\u007f]/.test(value)) return invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  // Official v11 guide documents this host for the returned hosted Url.
  if (url.protocol !== "https:" || url.hostname !== "secure.cardcom.solutions" || url.port || url.username || url.password || value.includes("#")) return invalid();
  return url.href;
}
function serverUrl(value: string) {
  try {
    const url = new URL(value);
    if (value.length > 500 || url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error();
    return url.href;
  } catch { throw new PaymentError("not_configured"); }
}

export function cardcomHosted(
  credentials: Record<string, string>, environment: PaymentEnvironment,
  network: typeof fetch, timeoutMs: number,
): Pick<PaymentProvider, "createPayment" | "getPaymentStatus" | "verifyCallback"> {
  const configuration = () => {
    // Deliberately no production implementation/activation in this milestone.
    if (environment !== "test") throw new PaymentError("not_implemented");
    const parsed = credentialsSchema.safeParse(credentials);
    if (!parsed.success) throw new PaymentError("invalid_credentials");
    // Official non-charging test terminal. Do not treat arbitrary credentials as sandbox.
    assertCardcomTestConfiguration(parsed.data, environment);
    return { TerminalNumber: 1000, ApiName: parsed.data.apiName };
  };
  const post = async (operation: "Create" | "GetLpResult", body: string) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = async () => {
      const response = await network(api + operation, {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" }, body,
      });
      if (!response.ok || response.redirected || !response.body) throw new PaymentError("cardcom_http_error");
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) return invalid();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new PaymentError("cardcom_response_too_large");
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return record(parseCardcomJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
    };
    try {
      return await Promise.race([
        request(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { reject(new PaymentError("cardcom_timeout")); controller.abort(); }, timeoutMs);
        }),
      ]);
    } catch (error) {
      controller.abort();
      if (error instanceof PaymentError) throw error;
      throw new PaymentError("cardcom_unavailable");
    } finally { if (timer) clearTimeout(timer); }
  };
  const getPaymentStatus: PaymentProvider["getPaymentStatus"] = async (attempt: PaymentAttempt) => {
    const auth = configuration();
    if (attempt.provider !== "cardcom" || attempt.environment !== environment) throw new PaymentError("invalid_confirmation");
    cardcomAmount(attempt.amount, attempt.currency);
    const id = profile(attempt.providerTransactionId);
    const result = await post("GetLpResult", JSON.stringify({ ...auth, LowProfileId: id }));
    // No nonzero code is interpreted as a terminal failure. Throwing leaves the
    // durable attempt and inventory unchanged; it never manufactures evidence.
    if (integer(result.ResponseCode) !== BigInt(0)) throw new PaymentError("cardcom_unresolved");
    if (result.TranzactionInfo == null) throw new PaymentError("cardcom_unresolved");
    const transaction = record(result.TranzactionInfo);
    if (integer(transaction.ResponseCode) !== BigInt(0)) throw new PaymentError("cardcom_unresolved");
    const charge = cardcomChargeId(result.TranzactionId);
    if (
      result.Operation !== "ChargeOnly" || transaction.IsRefund !== false || transaction.DealType !== "Debit" ||
      profile(result.LowProfileId) !== id || result.ReturnValue !== attempt.externalReference ||
      integer(result.TerminalNumber) !== BigInt(auth.TerminalNumber) || integer(transaction.TerminalNumber) !== BigInt(auth.TerminalNumber) ||
      charge !== cardcomChargeId(transaction.TranzactionId) || integer(transaction.CoinId) !== BigInt(1) ||
      (attempt.providerChargeId != null && charge !== attempt.providerChargeId) ||
      !matchesAmount(transaction.Amount, attempt.amount)
    ) throw new PaymentError("invalid_confirmation");
    return {
      provider: "cardcom", providerTransactionId: attempt.providerTransactionId!,
      providerChargeId: charge,
      externalReference: attempt.externalReference, amount: attempt.amount, currency: "ILS", status: "paid",
    };
  };
  return {
    async createPayment(input) {
      const auth = configuration();
      const amount = cardcomAmount(input.amount, input.currency);
      if (!input.externalReference || input.externalReference.length > 250) throw new PaymentError("invalid_confirmation");
      const fields = JSON.stringify({
        ...auth, Operation: "ChargeOnly", ReturnValue: input.externalReference, ISOCoinId: 1,
        SuccessRedirectUrl: serverUrl(input.returnUrl), FailedRedirectUrl: serverUrl(input.returnUrl),
        CancelRedirectUrl: serverUrl(input.returnUrl), WebHookUrl: serverUrl(input.callbackUrl),
      });
      // Insert a validated decimal NUMBER, not a quoted string or rounded float.
      const result = await post("Create", `${fields.slice(0, -1)},"Amount":${amount}}`);
      if (integer(result.ResponseCode) !== BigInt(0)) throw new PaymentError("cardcom_creation_rejected");
      return { providerTransactionId: profile(result.LowProfileId), redirectUrl: cardcomHostedUrl(result.Url) };
    },
    getPaymentStatus,
    async verifyCallback({ body, attempt }) {
      configuration();
      if (Buffer.byteLength(body, "utf8") > 65536) throw new PaymentError("invalid_callback");
      const hint = record(parseCardcomJson(body));
      if (profile(hint.LowProfileId) !== profile(attempt.providerTransactionId)) throw new PaymentError("invalid_callback");
      // All other callback fields are untrusted and deliberately ignored.
      return getPaymentStatus(attempt);
    },
  };
}
