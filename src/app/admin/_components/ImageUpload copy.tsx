"use client";
import { useDropzone } from "react-dropzone";
import { useState } from "react";
import { Upload } from "lucide-react";

export function ImageUpload() {
  const [file, setFile] = useState<File | null>(null);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [],
    },
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
      }
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 h-[400px] w-[400px] border-dashed rounded-md p-3 cursor-pointer flex items-center justify-center ${
        isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
    >
      <input {...getInputProps()} name="image" />
      {!file && (
        <div className="flex flex-col items-center space-y-2">
          <Upload size={32} color="gray" />

          <p className="text-xl font-bold">Click to Upload Or Drag & Drop</p>
        </div>
      )}
      {file && (
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={URL.createObjectURL(file)}
            alt="Preview"
            className="max-w-full max-h-full rounded-md object-contain"
          />
        </div>
      )}
    </div>
  );
}
