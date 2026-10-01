"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { setDashboardLocaleAction } from "../_actions";

export function DashboardLanguageSwitcher({
  locale,
}: {
  locale: "he" | "en";
}) {
  const router = useRouter();
  const t = useTranslations("StoreCatalogManagement");
  const [pending, startTransition] = useTransition();
  const nextLocale = locale === "he" ? "en" : "he";

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("language")}
      onClick={() => {
        startTransition(async () => {
          await setDashboardLocaleAction(nextLocale);
          router.refresh();
        });
      }}
      className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
    >
      {nextLocale === "he" ? t("hebrew") : t("english")}
    </button>
  );
}
