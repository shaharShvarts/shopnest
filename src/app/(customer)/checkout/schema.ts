import { z } from "zod";

// אימות תוקף כרטיס אשראי (MM/YY)
const expirationSchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "פורמט לא תקין (MM/YY)")
  .refine(
    (value) => {
      const [monthStr, yearStr] = value.split("/");
      const month = parseInt(monthStr, 10);
      const year = parseInt("20" + yearStr, 10);

      const now = new Date();
      const expiry = new Date(year, month - 1, 1);

      return expiry >= new Date(now.getFullYear(), now.getMonth(), 1);
    },
    {
      message: "תוקף הכרטיס פג",
    }
  );

// אימות מספר כרטיס לפי אלגוריתם Luhn
const cardNumberSchema = z
  .string()
  .min(12, "מספר כרטיס קצר מדי")
  .max(19, "מספר כרטיס ארוך מדי")
  .refine(
    (value) => {
      const digits = value.replace(/\D/g, "");
      let sum = 0;
      let shouldDouble = false;

      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i], 10);
        if (shouldDouble) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
      }

      return sum % 10 === 0;
    },
    {
      message: "מספר כרטיס לא תקין",
    }
  );

// סכמת כתובת למשלוח
const shippingSchema = z.object({
  shipping_name: z.string().min(1, "שם נדרש"),
  shipping_lastName: z.string().min(1, "שם משפחה נדרש"),
  shipping_address: z.string().min(1, "כתובת נדרשת"),
  shipping_city: z.string().min(1, "עיר נדרשת"),
  shipping_state: z.string().min(1, "מדינה נדרשת"),
  shipping_postal: z.string().min(1, "מיקוד נדרש"),
  shipping_phone: z.string().min(1, "טלפון נדרש"),
});

// סכמת כתובת לחיוב
const billingSchema = z.object({
  billing_name: z.string().min(1, "שם נדרש"),
  billing_lastName: z.string().min(1, "שם משפחה נדרש"),
  billing_address: z.string().min(1, "כתובת נדרשת"),
  billing_city: z.string().min(1, "עיר נדרשת"),
  billing_state: z.string().min(1, "מדינה נדרשת"),
  billing_postal: z.string().min(1, "מיקוד נדרש"),
  billing_phone: z.string().min(1, "טלפון נדרש"),
});

const cardSchema = z.object({
  card_name: z.string().min(1, "שם על הכרטיס נדרש"),
  card_number: cardNumberSchema,
  card_expiry: expirationSchema,
  card_cvv: z.string().regex(/^\d{3,4}$/, "CVV לא תקין"),
  card_id: z
    .string()
    .min(6, "Card ID must be at least 6 characters")
    .max(30, "Card ID too long"),
});

// סכמת Checkout מלאה
export const checkoutSchema = z
  .object({
    email: z.string().min(1, "אימייל נדרש").email("אימייל לא תקין"),
    cardName: z.string().min(1, "שם על הכרטיס נדרש"),
    cardNumber: cardNumberSchema,
    expiry: expirationSchema,
    securityCode: z.string().regex(/^\d{3,4}$/, "CVV לא תקין"),
    cardId: z.string().min(6).max(30),
    payment: z.string().min(1, "שיטת תשלום נדרשת"),
    billing_enabled: z.string().optional(), // checkbox
  })
  .merge(shippingSchema)
  .superRefine((data, ctx) => {
    if (data.payment === "credit") {
      const cardFields = checkoutSchema.safeParse(data);
      if (!cardFields.success) {
        const errors = cardFields.error.flatten().fieldErrors;
        for (const key of Object.keys(errors) as (keyof typeof errors)[]) {
          errors[key]?.forEach((msg) => {
            ctx.addIssue({
              path: [key],
              code: z.ZodIssueCode.custom,
              message: msg,
            });
          });
        }
      }
    }
  });
