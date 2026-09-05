import "server-only";
import { PaymentError, type PaymentEnvironment, type PaymentProvider } from "../types.ts";
import { credentialsSchema } from "./cardcom.ts";

const endpoint = "https://secure.cardcom.solutions/Interface/BillGoldService.asmx";
const soapNamespace = "http://schemas.xmlsoap.org/soap/envelope/";
const serviceNamespace = "BillGoldService";
const maxResponseBytes = 256 * 1024;

function escapeXml(value: string) {
  if (/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd]/u.test(value)) throw new Error();
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

type Element = { name: string; namespace: string; qualified: string; text: string; children: Element[]; namespaces: Record<string, string> };

// Deliberately restricted XML subset, not a general XML parser. No DTDs,
// entities beyond XML's built-ins/numeric references, or processing instructions.
// Reject unsupported syntax rather than trying to recover malformed responses.
function parseXml(xml: string): Element {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(xml)) throw new Error();
  const decode = (value: string) => value.replace(/&([^;]*);|&/g, (match, entity: string) => {
    const builtins: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(builtins, entity)) return builtins[entity];
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity ?? "")) throw new Error();
    const n = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!(n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff))) throw new Error();
    return String.fromCodePoint(n);
  });
  xml = xml.replace(/^\uFEFF/, "").replace(/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']utf-8["'])?\s*\?>/i, "");
  const stack: Element[] = [];
  let root: Element | undefined;
  const tokens = /<[^>]*>|[^<]+/gy;
  let position = 0;
  for (let token = tokens.exec(xml); token; token = tokens.exec(xml)) {
    position = tokens.lastIndex;
    const value = token[0];
    if (!value.startsWith("<")) {
      if (value.includes("]]>")) throw new Error();
      const text = decode(value);
      if (!stack.length) { if (text.trim()) throw new Error(); }
      else stack[stack.length - 1].text += text;
      continue;
    }
    const close = /^<\/([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*>$/.exec(value);
    if (close) { if (stack.pop()?.qualified !== close[1]) throw new Error(); continue; }
    const open = /^<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>$/.exec(value);
    if (!open || stack.length > 32) throw new Error();
    const namespaces: Record<string, string> = { ...(stack.at(-1)?.namespaces ?? {}), xml: "http://www.w3.org/XML/1998/namespace" };
    const attributes = new Set<string>();
    for (const attr of open[2].matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      if (attributes.has(attr[1])) throw new Error();
      attributes.add(attr[1]);
      const content = decode(attr[2] ?? attr[3]);
      if (attr[1] === "xmlns") namespaces[""] = content;
      else if (attr[1].startsWith("xmlns:")) namespaces[attr[1].slice(6)] = content;
    }
    for (const attr of attributes) {
      if (attr.includes(":") && !attr.startsWith("xmlns:") && !namespaces[attr.split(":")[0]]) throw new Error();
    }
    const parts = open[1].split(":");
    const prefix = parts.length === 2 ? parts[0] : "";
    if (prefix && !namespaces[prefix]) throw new Error();
    const element: Element = { qualified: open[1], name: parts.at(-1)!, namespace: namespaces[prefix] ?? "", text: "", children: [], namespaces };
    if (stack.length) stack.at(-1)!.children.push(element);
    else { if (root) throw new Error(); root = element; }
    if (!open[3]) stack.push(element);
  }
  if (position !== xml.length || stack.length || !root) throw new Error();
  return root;
}

function matchesTerminal(xml: string, terminal: string): boolean {
  const root = parseXml(xml);
  const one = (parent: Element, name: string, namespace = serviceNamespace) => {
    const entries = parent.children.filter((child) => child.name === name && child.namespace === namespace);
    if (entries.length !== 1 || parent.text.trim()) throw new Error();
    return entries[0];
  };
  if (root.name !== "Envelope" || root.namespace !== soapNamespace) return false;
  const body = one(root, "Body", soapNamespace);
  if (body.children.length !== 1) return false;
  const result = one(one(body, "GetUserTerminalListResponse"), "GetUserTerminalListResult");
  const code = one(result, "ResponseCode");
  if (code.children.length || !/^0+$/.test(code.text.trim())) return false;
  const terminals = one(result, "Terminals");
  return terminals.children.some((entry) => {
    if (entry.name !== "TerminalsList" || entry.namespace !== serviceNamespace) return false;
    const number = one(entry, "TerminalNumber");
    return !number.children.length && /^\d+$/.test(number.text.trim()) && Number(number.text.trim()) === Number(terminal);
  });
}

export function cardcomAdapter(
  credentials: Record<string, string>,
  _environment: PaymentEnvironment,
  network: typeof fetch = fetch,
  timeoutMs = 9000,
): PaymentProvider {
  const unavailable = async (): Promise<never> => { throw new PaymentError("not_implemented"); };
  return {
    createPayment: unavailable,
    verifyCallback: unavailable,
    getPaymentStatus: unavailable,
    async testConnection() {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const parsed = credentialsSchema.parse(credentials);
        const request = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="${soapNamespace}"><soap:Body><GetUserTerminalList xmlns="${serviceNamespace}"><userName>${escapeXml(parsed.apiName)}</userName><userPassword>${escapeXml(parsed.apiPassword)}</userPassword></GetUserTerminalList></soap:Body></soap:Envelope>`;
        const operation = async () => {
          const response = await network(endpoint, {
            method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
            headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"BillGoldService/GetUserTerminalList"' },
            body: request,
          });
          if (!response.ok || !response.body) return false;
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > maxResponseBytes) { controller.abort(); return false; }
              chunks.push(value);
            }
          } finally { reader.releaseLock(); }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          return matchesTerminal(new TextDecoder("utf-8", { fatal: true }).decode(bytes), parsed.terminalNumber);
        };
        return await Promise.race([
          operation(),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(false); }, timeoutMs); }),
        ]);
      } catch { return false; }
      finally { if (timer) clearTimeout(timer); }
    },
  };
}
