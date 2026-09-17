"use client";

import { useTranslations } from "next-intl";
import { useTenant } from "@/context/TenantContext";
import { Button } from "@/components/ui/button";

export function GoogleLoginButton({
  callback,
  enabled,
}: {
  callback: string;
  enabled: boolean;
}) {
  const t = useTranslations("CustomerAccount");
  const tenant = useTenant();
  const href = tenant.path(
    `/account/google/start?callback=${encodeURIComponent(callback)}`
  );

  return (
    <div className="space-y-3">
      {enabled ? (
        <Button asChild variant="outline" className="min-h-11 w-full">
          <a href={href}>{t("continueWithGoogle")}</a>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled
          aria-describedby="google-login-unavailable"
        >
          {t("continueWithGoogle")}
        </Button>
      )}
      {!enabled && (
        <p
          id="google-login-unavailable"
          className="text-center text-xs text-muted-foreground"
        >
          {t("googleUnavailable")}
        </p>
      )}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{t("or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
