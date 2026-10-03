import "server-only";

export interface StoreManagerInvitationDelivery {
  deliverInvitation(input: {
    email: string;
    invitationUrl: string;
    storeName: string;
  }): Promise<void>;
}

type ResendEmailResponse = {
  id?: string;
  message?: string;
};

export class ResendStoreManagerInvitationDelivery
  implements StoreManagerInvitationDelivery
{
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async deliverInvitation(input: {
    email: string;
    invitationUrl: string;
    storeName: string;
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
        subject: `ShopNest store invitation / הזמנה לניהול חנות ב-ShopNest`,
        text: [
          `You were invited to manage ${input.storeName} in ShopNest.`,
          input.invitationUrl,
          "",
          "This link expires in 24 hours.",
          "",
          `הוזמנת לנהל את החנות ${input.storeName} ב-ShopNest.`,
          input.invitationUrl,
          "",
          "תוקף הקישור הוא 24 שעות.",
        ].join("\n"),
        html: `
          <div dir="auto" style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>ShopNest store invitation</h2>
            <p>You were invited to manage <strong>${escapeHtml(input.storeName)}</strong>.</p>
            <p><a href="${escapeHtml(input.invitationUrl)}">Accept invitation</a></p>
            <p>This link expires in 24 hours.</p>
            <hr />
            <h2>הזמנה לניהול חנות ב-ShopNest</h2>
            <p>הוזמנת לנהל את החנות <strong>${escapeHtml(input.storeName)}</strong>.</p>
            <p><a href="${escapeHtml(input.invitationUrl)}">קבלת ההזמנה</a></p>
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
        // Keep status-only detail.
      }
      throw new Error(`Resend Store Manager invitation failed: ${detail}`);
    }
  }
}

export class DevelopmentStoreManagerInvitationDelivery
  implements StoreManagerInvitationDelivery
{
  async deliverInvitation(input: {
    email: string;
    invitationUrl: string;
    storeName: string;
  }) {
    console.info(
      `[ShopNest Store Manager invitation] ${input.storeName} -> ${input.email}: ${input.invitationUrl}`
    );
  }
}

export function createStoreManagerInvitationDelivery(input: {
  nodeEnv?: string;
  apiKey?: string;
  from?: string;
  developmentCaptureEnabled?: boolean;
} = {}): StoreManagerInvitationDelivery {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const apiKey = input.apiKey ?? process.env.RESEND_API_KEY;
  const from = input.from ?? process.env.SHOPNEST_EMAIL_FROM;
  const developmentCaptureEnabled =
    input.developmentCaptureEnabled ??
    process.env.SHOPNEST_MANAGER_INVITE_DEV_CAPTURE === "1";

  if (developmentCaptureEnabled) {
    return new DevelopmentStoreManagerInvitationDelivery();
  }
  if (apiKey && from) {
    return new ResendStoreManagerInvitationDelivery(apiKey, from);
  }
  if (nodeEnv !== "production") {
    return new DevelopmentStoreManagerInvitationDelivery();
  }

  throw new Error("Store Manager invitation email delivery is not configured");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
