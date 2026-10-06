import { eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import { organizationLogoAssets } from "@/drizzle/control-schema/organizationLogoAsset";
import {
  OrganizationLogoStorageError,
  readOrganizationLogo,
} from "@/lib/organization-logo-library/local-logo-store.mjs";

export const dynamic = "force-dynamic";

type OrganizationLogoRouteContext = {
  params: Promise<{ assetId: string; filename: string }>;
};

export async function GET(
  _: Request,
  context: OrganizationLogoRouteContext
) {
  const { assetId, filename } = await context.params;
  const parsedAssetId = Number(assetId);

  if (!Number.isSafeInteger(parsedAssetId) || parsedAssetId <= 0) {
    return new Response("Not Found", { status: 404 });
  }

  const [asset] = await getControlPlaneDb()
    .select({
      organizationId: organizationLogoAssets.organizationId,
      contentHash: organizationLogoAssets.contentHash,
      storedFilename: organizationLogoAssets.filename,
    })
    .from(organizationLogoAssets)
    .where(eq(organizationLogoAssets.id, parsedAssetId))
    .limit(1);

  if (!asset || filename !== asset.storedFilename) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const image = await readOrganizationLogo({
      organizationId: asset.organizationId,
      contentHash: asset.contentHash,
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
    if (error instanceof OrganizationLogoStorageError) {
      return new Response("Not Found", { status: 404 });
    }

    throw error;
  }
}
