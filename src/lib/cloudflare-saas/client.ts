import {
  canonicalCloudflareHostname,
  type CloudflareCustomHostname,
} from "./core.ts";

const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_CHARS = 1_000_000;

type FetchLike = typeof fetch;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerCode(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return null;
  const first = payload.errors.find(isRecord);
  if (!first) return null;
  const code = first.code;
  if (typeof code === "number" || typeof code === "string") {
    return String(code).slice(0, 80);
  }
  return null;
}

export class CloudflareSaasError extends Error {
  constructor(
    public readonly kind:
      | "http_error"
      | "malformed_response"
      | "network_error"
      | "timeout"
      | "response_too_large",
    public readonly status: number | null = null,
    public readonly providerCode: string | null = null
  ) {
    const statusPart = status === null ? "" : ` status=${status}`;
    const codePart = providerCode === null ? "" : ` code=${providerCode}`;
    super(`Cloudflare SaaS request failed: ${kind}${statusPart}${codePart}`);
    this.name = "CloudflareSaasError";
  }
}

function parseCustomHostname(value: unknown): CloudflareCustomHostname {
  if (!isRecord(value)) {
    throw new CloudflareSaasError("malformed_response");
  }

  const id = value.id;
  const hostname = value.hostname;
  const status = value.status;
  const sslStatus =
    isRecord(value.ssl) && typeof value.ssl.status === "string"
      ? value.ssl.status
      : null;

  if (
    typeof id !== "string" ||
    !id ||
    typeof hostname !== "string" ||
    canonicalCloudflareHostname(hostname) !== hostname ||
    typeof status !== "string" ||
    !status
  ) {
    throw new CloudflareSaasError("malformed_response");
  }

  return { id, hostname, status, sslStatus };
}

function requireCanonicalHostname(hostname: string) {
  const canonical = canonicalCloudflareHostname(hostname);
  if (!canonical || canonical !== hostname) {
    throw new Error("Cloudflare custom hostname must be canonical and exact");
  }
}

export class CloudflareSaasClient {
  private readonly apiToken: string;
  private readonly zoneId: string;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(input: {
    apiToken: string;
    zoneId: string;
    fetchImpl?: FetchLike;
    baseUrl?: string;
    timeoutMs?: number;
  }) {
    if (!input.apiToken) throw new Error("Cloudflare API token is required");
    if (!/^[a-f0-9]{32}$/i.test(input.zoneId)) {
      throw new Error("Cloudflare zone ID is invalid");
    }

    this.apiToken = input.apiToken;
    this.zoneId = input.zoneId.toLowerCase();
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.baseUrl = (input.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async listCustomHostnames(): Promise<CloudflareCustomHostname[]> {
    const result = await this.request("/custom_hostnames?per_page=1000");
    if (!Array.isArray(result)) {
      throw new CloudflareSaasError("malformed_response");
    }
    return result.map(parseCustomHostname);
  }

  async findCustomHostnameByHostname(
    hostname: string
  ): Promise<CloudflareCustomHostname[]> {
    requireCanonicalHostname(hostname);
    const result = await this.request(
      `/custom_hostnames?hostname=${encodeURIComponent(hostname)}&per_page=50`
    );
    if (!Array.isArray(result)) {
      throw new CloudflareSaasError("malformed_response");
    }
    return result.map(parseCustomHostname);
  }

  async getCustomHostname(id: string): Promise<CloudflareCustomHostname> {
    if (!id) throw new Error("Cloudflare custom hostname ID is required");
    return parseCustomHostname(
      await this.request(`/custom_hostnames/${encodeURIComponent(id)}`)
    );
  }

  async createCustomHostname(
    hostname: string
  ): Promise<CloudflareCustomHostname> {
    requireCanonicalHostname(hostname);
    return parseCustomHostname(
      await this.request("/custom_hostnames", {
        method: "POST",
        body: JSON.stringify({
          hostname,
          ssl: {
            method: "http",
            type: "dv",
            wildcard: false,
          },
        }),
      })
    );
  }

  async deleteCustomHostname(id: string): Promise<void> {
    if (!id) throw new Error("Cloudflare custom hostname ID is required");
    await this.request(`/custom_hostnames/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  private async request(
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/zones/${this.zoneId}${path}`,
        {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(init.headers ?? {}),
          },
        }
      );

      const raw = await response.text();
      if (raw.length > MAX_RESPONSE_CHARS) {
        throw new CloudflareSaasError(
          "response_too_large",
          response.status
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new CloudflareSaasError(
          "malformed_response",
          response.status
        );
      }

      if (
        !response.ok ||
        !isRecord(payload) ||
        payload.success !== true ||
        !("result" in payload)
      ) {
        throw new CloudflareSaasError(
          "http_error",
          response.status,
          providerCode(payload)
        );
      }

      return payload.result;
    } catch (error) {
      if (error instanceof CloudflareSaasError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new CloudflareSaasError("timeout");
      }
      throw new CloudflareSaasError("network_error");
    } finally {
      clearTimeout(timeout);
    }
  }
}
