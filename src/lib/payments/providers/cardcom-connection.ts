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

type Element = {
  name: string;
  namespace: string;
  qualified: string;
  text: string;
  children: Element[];
  namespaces: Map<string, string>;
};
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const xmlnsNamespace = "http://www.w3.org/2000/xmlns/";
const xmlWhitespace = /^[ \t\r\n]*$/;
const qualifiedName = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;

// Deliberately restricted XML subset, not a general XML parser. No DTDs,
// external/custom entities, comments, CDATA or processing instructions.
// Reject unsupported syntax rather than recovering malformed responses.
function parseXml(xml: string): Element {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(xml))
    throw new Error();
  const decode = (value: string) => value.replace(/&([^;&<]*);|&/g, (_match, entity: string) => {
    const builtins: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(builtins, entity)) return builtins[entity];
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity ?? "")) throw new Error();
    const n = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!(n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff))) throw new Error();
    return String.fromCodePoint(n);
  });
  // Quotes must match, and only XML whitespace may separate declaration fields.
  xml = xml.replace(/^\uFEFF/, "").replace(
    /^<\?xml[ \t\r\n]+version=(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding=(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?[ \t\r\n]*\?>/,
    "",
  );
  const stack: Element[] = [];
  let root: Element | undefined;
  const tokens = /<[^>]*>|[^<]+/gy;
  let position = 0;
  for (let token = tokens.exec(xml); token; token = tokens.exec(xml)) {
    position = tokens.lastIndex;
    const value = token[0];
    if (!value.startsWith("<")) {
      if (value.includes("]]>")) throw new Error();
      if (!stack.length) {
        // Character references are not permitted outside the document element.
        if (!xmlWhitespace.test(value)) throw new Error();
      } else stack[stack.length - 1].text += decode(value);
      continue;
    }
    const close = /^<\/([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)[ \t\r\n]*>$/.exec(value);
    if (close) {
      if (stack.pop()?.qualified !== close[1]) throw new Error();
      continue;
    }
    const open = /^<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:[ \t\r\n]+[A-Za-z_][\w.:-]*[ \t\r\n]*=[ \t\r\n]*(?:"[^"<]*"|'[^'<]*'))*)[ \t\r\n]*(\/?)>$/.exec(value);
    if (!open || stack.length >= 32) throw new Error();
    const namespaces = new Map(stack.at(-1)?.namespaces ?? [["xml", xmlNamespace]]);
    const attributes = new Set<string>();
    for (const attr of open[2].matchAll(/([A-Za-z_][\w.:-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/g)) {
      const name = attr[1];
      if (!qualifiedName.test(name) || attributes.has(name)) throw new Error();
      attributes.add(name);
      const content = decode(attr[2] ?? attr[3]);
      if (name === "xmlns" || name.startsWith("xmlns:")) {
        const prefix = name === "xmlns" ? "" : name.slice(6);
        if (
          prefix === "xmlns" ||
          content === xmlnsNamespace ||
          (prefix === "xml") !== (content === xmlNamespace) ||
          (prefix !== "" && content === "") ||
          /\s/.test(content)
        ) throw new Error();
        namespaces.set(prefix, content);
      }
    }
    // Attribute uniqueness is defined by namespace URI + local name, not prefix.
    const expandedAttributes = new Set<string>();
    for (const attr of attributes) {
      if (attr === "xmlns" || attr.startsWith("xmlns:")) continue;
      const parts = attr.split(":");
      const prefix = parts.length === 2 ? parts[0] : "";
      if (prefix && !namespaces.has(prefix)) throw new Error();
      const expanded = JSON.stringify([prefix ? namespaces.get(prefix) : "", parts.at(-1)]);
      if (expandedAttributes.has(expanded)) throw new Error();
      expandedAttributes.add(expanded);
    }
    const parts = open[1].split(":");
    const prefix = parts.length === 2 ? parts[0] : "";
    if (prefix === "xmlns" || (prefix && !namespaces.has(prefix))) throw new Error();
    const element: Element = {
      qualified: open[1], name: parts.at(-1)!, namespace: namespaces.get(prefix) ?? "",
      text: "", children: [], namespaces,
    };
    if (stack.length) stack.at(-1)!.children.push(element);
    else {
      if (root) throw new Error();
      root = element;
    }
    if (!open[3]) stack.push(element);
  }
  if (position !== xml.length || stack.length || !root) throw new Error();
  return root;
}

function matchesTerminal(xml: string, terminal: string): boolean {
  const root = parseXml(xml);
  const one = (parent: Element, name: string, namespace = serviceNamespace) => {
    const entries = parent.children.filter((child) => child.name === name && child.namespace === namespace);
    if (entries.length !== 1) throw new Error();
    return entries[0];
  };
  const only = (parent: Element, names: string[], namespace = serviceNamespace) => {
    if (!xmlWhitespace.test(parent.text) || parent.children.some(
      (child) => child.namespace !== namespace || !names.includes(child.name),
    )) throw new Error();
  };
  const description = (parent: Element) => {
    const entries = parent.children.filter((child) => child.name === "Description");
    if (entries.length > 1 || entries.some((child) => child.children.length)) throw new Error();
  };
  if (root.name !== "Envelope" || root.namespace !== soapNamespace) return false;
  only(root, ["Body"], soapNamespace);
  const body = one(root, "Body", soapNamespace);
  only(body, ["GetUserTerminalListResponse"]);
  const response = one(body, "GetUserTerminalListResponse");
  only(response, ["GetUserTerminalListResult"]);
  const result = one(response, "GetUserTerminalListResult");
  only(result, ["ResponseCode", "Description", "Terminals"]);
  description(result);
  const code = one(result, "ResponseCode");
  if (code.children.length || !/^[ \t\r\n]*0+[ \t\r\n]*$/.test(code.text)) return false;
  const terminals = one(result, "Terminals");
  only(terminals, ["TerminalsList"]);
  let matched = false;
  // Validate the entire list, even after finding a match.
  for (const entry of terminals.children) {
    only(entry, ["TerminalNumber", "Description"]);
    description(entry);
    const number = one(entry, "TerminalNumber");
    if (number.children.length || !/^[ \t\r\n]*[0-9]{1,9}[ \t\r\n]*$/.test(number.text)) return false;
    if (Number(number.text.trim()) === Number(terminal)) matched = true;
  }
  return matched;
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
