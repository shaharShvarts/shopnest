import "server-only";

import type { MerchantSignupDelivery } from "./core";

type ResendEmailResponse = {
  id?: string;
  message?: string;
};

export class ResendMerchantSignupDelivery
  implements MerchantSignupDelivery
{
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async deliverSignupVerification(input: {
    email: string;
    verificationUrl: string;
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
        subject: "Complete your ShopNest registration / השלמת הרשמה ל-ShopNest",
        text: [
          "Complete your ShopNest registration:",
          input.verificationUrl,
          "",
          "This link expires in 24 hours.",
          "",
          "להשלמת ההרשמה ל-ShopNest:",
          input.verificationUrl,
          "",
          "תוקף הקישור הוא 24 שעות.",
        ].join("\n"),
        html: `
          <div dir="auto" style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Complete your ShopNest registration</h2>
            <p>Use the secure link below to verify your email and choose your password.</p>
            <p><a href="${escapeHtml(input.verificationUrl)}">Complete registration</a></p>
            <p>This link expires in 24 hours.</p>
            <hr />
            <h2>השלמת הרשמה ל-ShopNest</h2>
            <p>לחץ על הקישור המאובטח כדי לאמת את כתובת המייל ולקבוע סיסמה.</p>
            <p><a href="${escapeHtml(input.verificationUrl)}">השלמת הרשמה</a></p>
            <p>תוקף הקישור הוא 24 שעות.</p>
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
      throw new Error(`Resend signup delivery failed: ${detail}`);
    }
  }
}

export class DevelopmentMerchantSignupDelivery
  implements MerchantSignupDelivery
{
  async deliverSignupVerification(input: {
    email: string;
    verificationUrl: string;
  }) {
    console.info(
      `[ShopNest merchant signup] ${input.email}: ${input.verificationUrl}`
    );
  }
}

export function createMerchantSignupDelivery(input: {
  nodeEnv?: string;
  apiKey?: string;
  from?: string;
  developmentCaptureEnabled?: boolean;
} = {}): MerchantSignupDelivery {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const apiKey = input.apiKey ?? process.env.RESEND_API_KEY;
  const from = input.from ?? process.env.SHOPNEST_EMAIL_FROM;
  const developmentCaptureEnabled =
    input.developmentCaptureEnabled ??
    process.env.SHOPNEST_SIGNUP_DEV_CAPTURE === "1";

  if (developmentCaptureEnabled) {
    return new DevelopmentMerchantSignupDelivery();
  }

  if (apiKey && from) {
    return new ResendMerchantSignupDelivery(apiKey, from);
  }

  if (nodeEnv !== "production") {
    return new DevelopmentMerchantSignupDelivery();
  }

  throw new Error("Merchant signup email delivery is not configured");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
