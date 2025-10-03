"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";

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
    <div className="sticky bottom-0 w-full bg-black text-white p-4 z-50 flex flex-col md:flex-row justify-between items-center">
      <p className="text-sm md:text-base mb-2 md:mb-0">
        We use cookies to improve your experience. By clicking "Accept", you
        agree to our use of cookies. See our{" "}
        <a
          href="/privacy-policy"
          className="underline text-blue-400 hover:text-blue-300"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
        .
      </p>
      <div className="flex space-x-2">
        <button
          onClick={() => handleConsent("true")}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm"
        >
          Accept
        </button>
        <button
          onClick={() => handleConsent("false")}
          className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
