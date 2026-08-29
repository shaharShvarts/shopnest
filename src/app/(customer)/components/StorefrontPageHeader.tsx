import { cn } from "@/lib/utils";

export function StorefrontPageHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "mb-4 break-words text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl",
        className
      )}
    >
      {children}
    </h1>
  );
}
