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

export function createPasswordResetDelivery(
  nodeEnv = process.env.NODE_ENV
): CustomerPasswordResetDelivery {
  return nodeEnv === "production"
    ? new UnconfiguredPasswordResetDelivery()
    : new DevelopmentPasswordResetDelivery();
}
