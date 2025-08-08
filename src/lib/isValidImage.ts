export function isValidImage(file: File | null): boolean {
  const maxFileSize = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? 0);
  const validImageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!file) {
    return false; // No file selected
  }

  if (!validImageTypes.includes(file.type)) {
    alert("Please select a valid image file.");
    return false; // Invalid file type
  }

  if (file.size > maxFileSize) {
    alert(
      `File size exceeds ${maxFileSize} bytes, please choose a smaller image.`
    );
    return false; // File size exceeds limit
  }

  return true; // Valid image file
}
