import { CatalogValidationError } from "./core";

type CatalogEntity = "category" | "subcategory" | "product";

export function catalogFormError(error: unknown, entity: CatalogEntity) {
  if (error instanceof CatalogValidationError) {
    return { field: error.field, message: error.message };
  }

  const code = postgresErrorCode(error);
  if (code === "23505") {
    return {
      field: "name" as const,
      message: `A ${entity} with this name already exists. Try a different name.`,
    };
  }
  if (code === "23503") {
    return {
      field: "categoryId" as const,
      message: "The selected catalog relationship is no longer valid.",
    };
  }

  return {
    field: "name" as const,
    message: `Unable to save the ${entity}. Please try again.`,
  };
}

export function isForeignKeyViolation(error: unknown) {
  return postgresErrorCode(error) === "23503";
}

function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresErrorCode(error.cause);
  return undefined;
}
