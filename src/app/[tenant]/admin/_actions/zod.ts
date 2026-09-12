import z from "zod";
import prettyBytes from "pretty-bytes";
import { SUPPORTED_IMAGE_CONTENT_TYPES } from "@/lib/images/image-url.mjs";

const maxFileSize = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? 0);

export const imageSchema = z.custom<File>(
  (file) =>
    file instanceof File &&
    SUPPORTED_IMAGE_CONTENT_TYPES.includes(file.type) &&
    file.size > 0 &&
    file.size <= maxFileSize,
  {
    message: `Image must be less than ${prettyBytes(
      maxFileSize
    )} and not empty`,
  }
);

export const optionalImageSchema = z.preprocess(
  (value) =>
    value instanceof File && value.size === 0 ? undefined : value,
  imageSchema.optional()
);
