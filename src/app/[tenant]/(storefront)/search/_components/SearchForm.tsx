import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_SEARCH_QUERY_LENGTH } from "@/lib/search/core";
import { cn } from "@/lib/utils";

export async function SearchForm({
  action,
  defaultValue = "",
  compact = false,
}: {
  action: string;
  defaultValue?: string;
  compact?: boolean;
}) {
  const t = await getTranslations("SearchPage");

  return (
    <form
      role="search"
      method="GET"
      action={action}
      className={cn(
        "flex min-w-0 items-center gap-2",
        compact ? "w-full" : "w-full max-w-2xl"
      )}
    >
      <label htmlFor={compact ? "header-search" : "page-search"} className="sr-only">
        {t("searchProducts")}
      </label>
      <Input
        id={compact ? "header-search" : "page-search"}
        type="search"
        name="q"
        defaultValue={defaultValue}
        maxLength={MAX_SEARCH_QUERY_LENGTH}
        placeholder={t("searchProducts")}
        autoComplete="off"
        dir="auto"
        className="h-11 min-w-0 bg-white text-foreground"
      />
      <Button
        type="submit"
        size={compact ? "icon" : "default"}
        className={cn("h-11 shrink-0", !compact && "min-w-11")}
        aria-label={t("search")}
      >
        <Search aria-hidden="true" />
        {!compact && <span>{t("search")}</span>}
      </Button>
    </form>
  );
}
