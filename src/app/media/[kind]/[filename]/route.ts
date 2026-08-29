import { getTenant } from "@/lib/tenant-context";
import {
  LocalMediaError,
  readCatalogImage,
} from "@/lib/media/catalog-media";

export const dynamic = "force-dynamic";

type MediaRouteContext = {
  params: Promise<{ kind: string; filename: string }>;
};

export async function GET(_: Request, context: MediaRouteContext) {
  const tenant = await getTenant();
  if (!tenant) return new Response("Not Found", { status: 404 });

  const { kind, filename } = await context.params;
  try {
    const image = await readCatalogImage({
      tenantSlug: tenant.slug,
      kind: kind as "categories" | "subcategories" | "products",
      filename,
    });
    return new Response(new Uint8Array(image.bytes), {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(image.bytes.length),
        "Content-Type": image.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof LocalMediaError) {
      return new Response("Not Found", { status: 404 });
    }
    throw error;
  }
}
