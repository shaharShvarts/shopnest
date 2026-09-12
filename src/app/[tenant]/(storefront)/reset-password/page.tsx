import { getTranslations } from "next-intl/server";
import { TenantLink } from "@/components/TenantLink";
import { ResetPasswordForm } from "../account/_components/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("CustomerAccount");
  const token = (await searchParams).token?.trim() ?? "";
  return (
    <div className="mx-auto w-full max-w-md py-6 sm:py-12">
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("resetPassword")}
        </h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          {t("resetPasswordDetail")}
        </p>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-5">
            <p role="alert" className="text-sm text-destructive">
              {t("invalidResetLink")}
            </p>
            <TenantLink
              href="/forgot-password"
              className="block min-h-11 rounded-lg px-3 py-2 text-center text-sm font-medium text-foreground underline underline-offset-4"
            >
              {t("requestAnotherResetLink")}
            </TenantLink>
          </div>
        )}
      </section>
    </div>
  );
}
