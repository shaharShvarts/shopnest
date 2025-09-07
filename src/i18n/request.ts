import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("SHOPNEST_LOCALE")?.value;
  const locale = cookieLocale ?? "he"; // fallback to Hebrew if no cookie;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
