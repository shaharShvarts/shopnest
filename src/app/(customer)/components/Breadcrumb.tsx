import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
    <Breadcrumb className="list-none flex items-center gap-1 pb-6">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;

        return (
          <BreadcrumbList key={segment.href ?? segment.label}>
            <BreadcrumbItem>
              {!segment.href ? (
                <BreadcrumbPage>{segment.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <a href={segment.href} className="hover:underline">
                    {segment.label}
                  </a>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!isLast && (
              <BreadcrumbSeparator role="presentation" aria-hidden="true">
                <span className="mx-1 text-muted-foreground">›</span>
              </BreadcrumbSeparator>
            )}
          </BreadcrumbList>
        );
      })}
    </Breadcrumb>
  );
}
