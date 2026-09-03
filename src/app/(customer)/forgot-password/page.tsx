import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "../account/_components/ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("CustomerAccount");
  return (
    <div className="mx-auto w-full max-w-md py-6 sm:py-12">
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("forgotPassword")}
        </h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          {t("forgotPasswordDetail")}
        </p>
        <ForgotPasswordForm />
      </section>
    </div>
  );
}
