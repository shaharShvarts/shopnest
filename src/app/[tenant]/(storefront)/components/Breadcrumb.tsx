import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { TenantLink } from "@/components/TenantLink";

type BreadcrumbSegment = {
  label: string;
  href?: string;
};

type DynamicBreadcrumbProps = {
  segments: BreadcrumbSegment[];
};

export default function DynamicBreadcrumb({
  segments,
}: DynamicBreadcrumbProps) {
  return (
    <Breadcrumb className="min-w-0 pb-4 sm:pb-6">
      <BreadcrumbList className="min-w-0 flex-wrap gap-x-1 gap-y-2 sm:gap-x-2">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <Fragment key={segment.href ?? segment.label}>
              <BreadcrumbItem>
                {!segment.href ? (
                  <BreadcrumbPage className="max-w-full break-words">
                    {segment.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <TenantLink
                      href={segment.href}
                      className="max-w-full break-words hover:underline"
                    >
                      {segment.label}
                    </TenantLink>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator role="presentation" aria-hidden="true">
                  <span className="mx-0.5 inline-block text-muted-foreground rtl:rotate-180 sm:mx-1">
                    ›
                  </span>
                </BreadcrumbSeparator>
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
