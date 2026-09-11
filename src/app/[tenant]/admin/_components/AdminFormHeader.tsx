import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { Button } from "@/components/ui/button";
import { TenantLink } from "@/components/TenantLink";

type AdminFormHeaderProps = {
  title: string;
  backHref: string;
  backLabel: string;
};

export function AdminFormHeader({
  title,
  backHref,
  backLabel,
}: AdminFormHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <Button variant="outline" asChild>
        <TenantLink href={backHref}>
          <ArrowLeft className="size-4" />
          {backLabel}
        </TenantLink>
      </Button>
      <PageHeader>{title}</PageHeader>
    </div>
  );
}
