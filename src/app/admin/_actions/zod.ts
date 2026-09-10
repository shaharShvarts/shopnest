import z from "zod";
import { ImageValidationError, validateCatalogImage } from "@/lib/media/validate-image.mjs";

export const imageSchema = z.custom<File>((file) => file instanceof File, {
  message: "Choose a valid, supported image.",
}).superRefine(async (file, context) => {
  if (!(file instanceof File)) return;
  try {
    await validateCatalogImage(file);
  } catch (error) {
    if (!(error instanceof ImageValidationError)) throw error;
    context.addIssue({ code: z.ZodIssueCode.custom, message: error.message });
  }
});

export const optionalImageSchema = z.preprocess(
  (value) => value instanceof File && value.size === 0 && value.name === "" ? undefined : value,
  imageSchema.optional()
);
