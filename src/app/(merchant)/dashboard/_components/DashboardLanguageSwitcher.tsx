"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
    <Button
      type="button"
      variant="outline"
      size="management"
      disabled={pending}
      aria-label={t("language")}
      onClick={() => {
        startTransition(async () => {
          await setDashboardLocaleAction(nextLocale);
          router.refresh();
        });
      }}
      className="px-4"
    >
      {nextLocale === "he" ? t("hebrew") : t("english")}
    </Button>
  );
}
