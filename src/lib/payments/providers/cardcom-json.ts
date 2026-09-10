import "server-only";
import { PaymentError } from "../types.ts";

// Keep every JSON number's original lexeme. JSON.parse alone rounds int64 IDs.
export class CardcomNumber {
  readonly text: string;
  constructor(text: string) { this.text = text; }
}

// Bounded JSON parser: rejects duplicate (including escaped) keys and excessive
// nesting rather than silently choosing one of two contradictory payment fields.
export function parseCardcomJson(text: string): unknown {
  let i = 0;
  const bad = (): never => { throw new PaymentError("cardcom_invalid_response"); };
  const space = () => { while (/[ \t\r\n]/.test(text[i] ?? "x")) i++; };
  const string = (): string => {
    const start = i++;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') {
        try { return JSON.parse(text.slice(start, i)) as string; } catch { bad(); }
      }
    }
    return bad();
  };
  const value = (depth: number): unknown => {
    if (depth > 32) return bad();
    space();
    if (text[i] === '"') return string();
    if (text[i] === "{") {
      i++; space();
      const result: Record<string, unknown> = Object.create(null);
      if (text[i] === "}") { i++; return result; }
      for (;;) {
        space();
        if (text[i] !== '"') return bad();
        const key = string(); space();
        if (Object.hasOwn(result, key) || text[i++] !== ":") return bad();
        result[key] = value(depth + 1); space();
        const end = text[i++];
        if (end === "}") return result;
        if (end !== ",") return bad();
      }
    }
    if (text[i] === "[") {
      i++; space();
      const result: unknown[] = [];
      if (text[i] === "]") { i++; return result; }
      for (;;) {
        result.push(value(depth + 1)); space();
        const end = text[i++];
        if (end === "]") return result;
        if (end !== ",") return bad();
      }
    }
    for (const [literal, result] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(literal, i)) { i += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
    if (!number) return bad();
    i += number[0].length;
    return new CardcomNumber(number[0]);
  };
  if (Buffer.byteLength(text, "utf8") > 256 * 1024) return bad();
  const result = value(0); space();
  if (i !== text.length) return bad();
  return result;
}
