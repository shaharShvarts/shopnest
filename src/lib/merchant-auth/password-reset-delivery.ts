import type { MerchantPasswordResetDelivery } from "./core";

export class UnconfiguredMerchantPasswordResetDelivery
  implements MerchantPasswordResetDelivery
{
  async deliverPasswordReset() {
    // Production provider integration is intentionally outside PR #35.
  }
}

export class DevelopmentMerchantPasswordResetDelivery
  implements MerchantPasswordResetDelivery
{
  async deliverPasswordReset(input: { email: string; resetUrl: string }) {
    console.info(
      `[ShopNest merchant password reset] ${input.email}: ${input.resetUrl}`
    );
  }
}

export function createMerchantPasswordResetDelivery(input: {
  nodeEnv?: string;
  developmentCaptureEnabled?: boolean;
} = {}): MerchantPasswordResetDelivery {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const developmentCaptureEnabled =
    input.developmentCaptureEnabled ??
    process.env.SHOPNEST_PASSWORD_RESET_DEV_CAPTURE === "1";

  return nodeEnv !== "production" || developmentCaptureEnabled
    ? new DevelopmentMerchantPasswordResetDelivery()
    : new UnconfiguredMerchantPasswordResetDelivery();
}
