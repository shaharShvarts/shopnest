"use client";

import { toast } from "react-toastify";
import prettyBytes from "pretty-bytes";
import { MAX_IMAGE_UPLOAD_BYTES } from "./images/upload-limits.mjs";

export function isValidImage(file: File | null): boolean {
  const maxFileSize = MAX_IMAGE_UPLOAD_BYTES;

  if (!file) {
    toast("Please select a valid image file.");
    return false; // No file selected
  }

  if (file.size > maxFileSize) {
    toast(
      `File size exceeds ${prettyBytes(
        maxFileSize
      )}, please choose a smaller image.`
    );
    return false; // File size exceeds limit
  }

  return true; // UX only; the server must decode and validate the contents.
}
