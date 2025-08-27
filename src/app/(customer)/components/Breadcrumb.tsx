import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function BreadcrumbComponent() {
  return (
    <Breadcrumb className="pb-6">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">בית</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="rotate-180" />
        <BreadcrumbItem>
          <BreadcrumbLink href="/categories">קטגוריות</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="rotate-180" />
        <BreadcrumbItem>
          <BreadcrumbPage>דף מוצר</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
