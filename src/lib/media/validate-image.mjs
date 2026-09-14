import sharp from "sharp";
import { MAX_IMAGE_UPLOAD_BYTES } from "../images/upload-limits.mjs";

export class ImageValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

// File objects are immutable and local to a request. Reuse the validated output
// between async form validation and storage without decoding the upload twice.
const validatedFiles = new WeakMap();
export async function validateCatalogImage(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new ImageValidationError("INVALID_IMAGE", "Choose a valid, supported image.");
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageValidationError("INVALID_SIZE", "Image must be non-empty and at most 5 MiB.");
  }
  let result = validatedFiles.get(file);
  if (!result) {
    result = decodeImage(file);
    validatedFiles.set(file, result);
  }
  return result;
}

async function decodeImage(file) {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageValidationError("INVALID_SIZE", "Image must be non-empty and at most 5 MiB.");
  }
  try {
    // No filename, MIME or Content-Type selectors. stats forces full pixel
    // decoding of every page/frame; metadata alone cannot establish validity.
    // Keep Sharp's input pixel/memory safeguards and strict warning handling.
    validateGifStructure(bytes);
    await sharp(bytes, { animated: true, failOn: "warning" }).stats();
    // Rasterize to a browser-safe format, stripping metadata and active SVG
    // content. Catalog images use the first page/frame, with EXIF orientation.
    return await sharp(bytes, { failOn: "warning" }).rotate().png().toBuffer();
  } catch {
    throw new ImageValidationError("INVALID_IMAGE", "Image is corrupt, invalid, or uses an unsupported format.");
  }
}

// libvips can recover a truncated GIF without emitting a warning. Check block
// boundaries too so that a recoverable partial animation is not accepted.
function validateGifStructure(bytes) {
  if (!["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return;
  let offset = 13;
  let frames = 0;
  const take = (length) => {
    if (offset + length > bytes.length) throw new Error("Truncated GIF");
    offset += length;
  };
  if (bytes.length < offset) throw new Error("Truncated GIF");
  if (bytes[10] & 128) take(3 * (2 ** ((bytes[10] & 7) + 1)));
  const subBlocks = () => {
    for (;;) {
      if (offset >= bytes.length) throw new Error("Truncated GIF");
      const length = bytes[offset++];
      if (length === 0) return;
      take(length);
    }
  };
  while (offset < bytes.length) {
    const block = bytes[offset++];
    if (block === 0x3b && frames > 0) return;
    if (block === 0x21) {
      take(1); // Extension label; its contents are length-prefixed sub-blocks.
      subBlocks();
    } else if (block === 0x2c) {
      take(9);
      const packed = bytes[offset - 1];
      if (packed & 128) take(3 * (2 ** ((packed & 7) + 1)));
      take(1); // LZW minimum code size; Sharp validates the compressed pixels.
      subBlocks();
      frames++;
    } else throw new Error("Invalid GIF block");
  }
  throw new Error("Missing GIF trailer");
}
