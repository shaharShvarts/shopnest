import "server-only";

import type { MerchantPasswordResetDelivery } from "./core";

type ResendEmailResponse = {
  id?: string;
  message?: string;
};

export class ResendMerchantPasswordResetDelivery
  implements MerchantPasswordResetDelivery
{
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async deliverPasswordReset(input: {
    email: string;
    resetUrl: string;
  }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `ShopNest <${this.from}>`,
        to: [input.email],
        subject: "Reset your ShopNest password / איפוס סיסמה ב-ShopNest",
        text: [
          "Reset your ShopNest password:",
          input.resetUrl,
          "",
          "This link expires in 30 minutes.",
          "",
          "לאיפוס הסיסמה שלך ב-ShopNest:",
          input.resetUrl,
          "",
          "תוקף הקישור הוא 30 דקות.",
        ].join("\n"),
        html: `
          <div dir="auto" style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Reset your ShopNest password</h2>
            <p>Use the secure link below to choose a new password.</p>
            <p><a href="${escapeHtml(input.resetUrl)}">Reset password</a></p>
            <p>This link expires in 30 minutes.</p>
            <hr />
            <h2>איפוס סיסמה ב-ShopNest</h2>
            <p>לחץ על הקישור המאובטח כדי לבחור סיסמה חדשה.</p>
            <p><a href="${escapeHtml(input.resetUrl)}">איפוס סיסמה</a></p>
            <p>תוקף הקישור הוא 30 דקות.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as ResendEmailResponse;
        if (body.message) detail = body.message;
      } catch {
        // Keep status-only detail when the provider does not return JSON.
      }
      throw new Error(`Resend password reset delivery failed: ${detail}`);
    }
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
  apiKey?: string;
  from?: string;
  developmentCaptureEnabled?: boolean;
} = {}): MerchantPasswordResetDelivery {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const apiKey = input.apiKey ?? process.env.RESEND_API_KEY;
  const from = input.from ?? process.env.SHOPNEST_EMAIL_FROM;
  const developmentCaptureEnabled =
    input.developmentCaptureEnabled ??
    process.env.SHOPNEST_PASSWORD_RESET_DEV_CAPTURE === "1";

  if (developmentCaptureEnabled) {
    return new DevelopmentMerchantPasswordResetDelivery();
  }

  if (apiKey && from) {
    return new ResendMerchantPasswordResetDelivery(apiKey, from);
  }

  if (nodeEnv !== "production") {
    return new DevelopmentMerchantPasswordResetDelivery();
  }

  throw new Error("Merchant password reset email delivery is not configured");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
