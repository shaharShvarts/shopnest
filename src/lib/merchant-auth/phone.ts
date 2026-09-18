const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const IL_MOBILE_PATTERN = /^05\d{8}$/;

export function normalizeMerchantPhone(input: string, defaultCountry: "IL" = "IL") {
  const normalized = input.trim().normalize("NFKC");
  if (!normalized || /[A-Za-z]/.test(normalized)) {
    throw new Error("invalid_phone");
  }

  const compact = normalized.replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) {
    if (!E164_PATTERN.test(compact)) throw new Error("invalid_phone");
    return compact;
  }

  if (defaultCountry === "IL" && IL_MOBILE_PATTERN.test(compact)) {
    return `+972${compact.slice(1)}`;
  }

  throw new Error("invalid_phone");
}
