import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/app/components/ProductCard";
import { getDbForTenant } from "@/drizzle/db";
import { InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";
import {
  readSearchQueryParam,
  SearchQueryError,
  searchStorefrontProducts,
} from "@/lib/search/core";
import { DrizzleStorefrontSearchStore } from "@/lib/search/drizzle-store";
import { getTenant, tenantPath } from "@/lib/tenant-context";
import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import { SearchForm } from "./_components/SearchForm";

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export async function generateMetadata() {
  const t = await getTranslations("SearchPage.Metadata");
  return { title: t("title"), description: t("description") };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const t = await getTranslations("SearchPage");
  const params = await searchParams;
  const rawQuery = readSearchQueryParam(params);
  const action = await tenantPath("/search");
  const db = getDbForTenant(tenant);

  let query = (rawQuery ?? "").trim();
  let results: Awaited<ReturnType<typeof searchStorefrontProducts>>["results"] = [];
  let queryError = false;
  try {
    const response = await searchStorefrontProducts(
      new DrizzleStorefrontSearchStore(db),
      new InventoryService(new DrizzleInventoryStore(db)),
      rawQuery
    );
    query = response.query;
    results = response.results;
  } catch (error) {
    if (!(error instanceof SearchQueryError)) throw error;
    queryError = true;
  }

  return (
    <section className="min-w-0">
      <StorefrontPageHeader>{t("searchResults")}</StorefrontPageHeader>
      <SearchForm action={action} defaultValue={queryError ? "" : query} />

      <div className="mt-6" aria-live="polite">
        {queryError ? (
          <SearchState title={t("queryTooLong")} detail={t("tryAnotherSearch")} />
        ) : !query ? (
          <SearchState title={t("prompt")} detail={t("promptDetail")} />
        ) : results.length === 0 ? (
          <SearchState title={t("noProductsFound")} detail={t("tryAnotherSearch")} />
        ) : (
          <>
            <p className="mb-4 break-words text-sm text-muted-foreground" dir="auto">
              {t("resultsFor", { query })}
            </p>
            <div className="grid min-w-0 grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((product) => (
                <ProductCard key={product.id} {...product} tenantSlug={tenant.slug} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SearchState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-6 text-center sm:p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
