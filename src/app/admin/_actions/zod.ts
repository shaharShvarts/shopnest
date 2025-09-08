import z from "zod";
import prettyBytes from "pretty-bytes";
import { env } from "@/data/env/server";

const maxFileSize = Number(env.MAX_FILE_SIZE ?? 0);

export const imageSchema = z.custom<File>(
  (file) =>
    file instanceof File &&
    file.type.startsWith("image/") &&
    file.size > 0 &&
    file.size <= maxFileSize,
  {
    message: `Image must be less than ${prettyBytes(
      maxFileSize
    )} and not empty`,
  }
);
