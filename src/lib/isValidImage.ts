"use client";

import { toast } from "react-toastify";
import prettyBytes from "pretty-bytes";

export function isValidImage(file: File | null): boolean {
  const maxFileSize = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? 0);
  const validImageTypes =
    process.env.NEXT_PUBLIC_VALID_IMAGE_TYPES?.split("|") ?? [];

  if (!file) {
    toast("Please select a valid image file.");
    return false; // No file selected
  }

  if (!validImageTypes.includes(file.type)) {
    toast(`"${file.type}" is not a supported image format.`, { type: "error" });
    return false; // Invalid file type
  }

  if (file.size > maxFileSize) {
    toast(
      `File size exceeds ${prettyBytes(
        maxFileSize
      )} bytes, please choose a smaller image.`
    );
    return false; // File size exceeds limit
  }

  return true; // Valid image file
}
