import type { CustomerPasswordResetDelivery } from "./core";

export class UnconfiguredPasswordResetDelivery
  implements CustomerPasswordResetDelivery
{
  async deliverPasswordReset() {
    // Production provider integration is intentionally outside this PR.
  }
}

export class DevelopmentPasswordResetDelivery
  implements CustomerPasswordResetDelivery
{
  async deliverPasswordReset(input: { email: string; resetUrl: string }) {
    console.info(
      `[ShopNest development password reset] ${input.email}: ${input.resetUrl}`
    );
  }
}

export function createPasswordResetDelivery(input: {
  nodeEnv?: string;
  developmentCaptureEnabled?: boolean;
} = {}): CustomerPasswordResetDelivery {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const developmentCaptureEnabled =
    input.developmentCaptureEnabled ??
    process.env.SHOPNEST_PASSWORD_RESET_DEV_CAPTURE === "1";
  return nodeEnv !== "production" || developmentCaptureEnabled
    ? new DevelopmentPasswordResetDelivery()
    : new UnconfiguredPasswordResetDelivery();
}
