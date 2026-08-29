"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { TenantLink } from "@/components/TenantLink";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = Cookies.get("cookie_consent");
    if (!consent) setVisible(true);
  }, []);

  const handleConsent = (value: string) => {
    Cookies.set("cookie_consent", value, { expires: 365 });
    localStorage.setItem("cookieConsent", value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="sticky bottom-0 z-50 flex w-full flex-col items-stretch justify-between gap-3 bg-black p-3 text-white sm:p-4 md:flex-row md:items-center">
      <p className="min-w-0 text-sm md:text-base">
        {`We use cookies to improve your experience. By clicking "Accept", you
        agree to our use of cookies. See our `}
        <TenantLink
          href="/privacy-policy"
          className="underline text-blue-400 hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </TenantLink>
        .
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => handleConsent("true")}
          className="min-h-11 flex-1 rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-500 md:flex-none"
        >
          Accept
        </button>
        <button
          onClick={() => handleConsent("false")}
          className="min-h-11 flex-1 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 md:flex-none"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
