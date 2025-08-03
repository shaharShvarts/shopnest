import { CheckCircle2, XCircle } from "lucide-react";

export function StatusIcon({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <CheckCircle2 className="text-green-500" />
  ) : (
    <XCircle className="text-red-500" />
  );
}
