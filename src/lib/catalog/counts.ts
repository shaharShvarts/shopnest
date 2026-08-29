type ProductRelation = {
  categoryId: number;
  subcategoryId: number | null;
};

export function countProductsByCategory(products: ProductRelation[]) {
  return countBy(products, (product) => product.categoryId);
}

export function countProductsBySubcategory(products: ProductRelation[]) {
  return countBy(products, (product) => product.subcategoryId);
}

export function countSubcategoriesByCategory(
  subcategories: Array<{ categoryId: number }>
) {
  return countBy(subcategories, (subcategory) => subcategory.categoryId);
}

export function countOrdersByProduct(
  orderProducts: Array<{ productId: number }>
) {
  return countBy(orderProducts, (orderProduct) => orderProduct.productId);
}

function countBy<T>(rows: T[], getId: (row: T) => number | null) {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const id = getId(row);
    if (id === null) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
