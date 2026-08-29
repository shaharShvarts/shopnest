"use client";

import { useDropzone } from "react-dropzone";
import { useState, useEffect, useMemo } from "react";
import { Upload } from "lucide-react";
import { isValidImage } from "@/lib/isValidImage";
import { useRef } from "react";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";
import { AdminImagePreview } from "./AdminImagePreview";
import { useTenant } from "@/context/TenantContext";

type ImageUploadProps = {
  initialImage?: string;
};

export function ImageUpload({ initialImage }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const tenant = useTenant();
  const existingImageUrl = useMemo(
    () => resolveTenantImageUrl(initialImage, tenant.slug),
    [initialImage, tenant.slug]
  );
  const previewUrl = objectUrl ?? existingImageUrl;
  const validImageTypes =
    process.env.NEXT_PUBLIC_VALID_IMAGE_TYPES?.split("|") ?? [];

  const imageTypes = validImageTypes.map(
    (type) => type.split("/").pop()?.toUpperCase() ?? ""
  );

  const { getRootProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    noClick: true,
    onDrop: (acceptedFiles) => {
      const uploadedFile = acceptedFiles?.[0];

      if (!handleFileSelect(uploadedFile)) return;

      // ✅ Sync dropped file to input element for form submission
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(uploadedFile);
        fileInputRef.current.files = dataTransfer.files;
      }
    },
  });

  const handleFileSelect = (image: File | null) => {
    if (!image || !isValidImage(image)) {
      setObjectUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return false;
    }

    setObjectUrl(URL.createObjectURL(image));
    return true;
  };

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  return (
    <div
      {...getRootProps()}
      className={`relative border-2 h-[400px] w-full max-w-3xl border-dashed rounded-md p-3 cursor-pointer flex items-center justify-center transition-colors ${
        isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
    >
      {/* Hidden but clickable input */}
      <input
        type="file"
        name="image"
        accept="image/*"
        aria-label="Upload image"
        ref={fileInputRef}
        required={!existingImageUrl}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={(e) => {
          const image = e.target.files?.[0] || null;
          handleFileSelect(image);
        }}
      />

      {/* Content */}
      {!previewUrl ? (
        <div className="flex flex-col items-center space-y-2 text-center pointer-events-none">
          <Upload size={32} color="gray" />
          <p className="text-xl font-bold">Click to Upload or Drag & Drop</p>
          <p className="text-sm font-bold">
            Supported formats: {imageTypes.join(", ")}
          </p>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center pointer-events-none">
          <AdminImagePreview src={previewUrl} alt="Selected image preview" />
        </div>
      )}
    </div>
  );
}
