/**
 * Sort stock locations so that Euro5 tank always appears last among tanks.
 * Standard tanks (T_A–T_H) sort alphabetically by code, then Euro5 at the end.
 */
export function sortStockLocations<T extends { code: string }>(locations: T[]): T[] {
  return [...locations].sort((a, b) => {
    const aIsEuro = a.code.toLowerCase().includes("euro");
    const bIsEuro = b.code.toLowerCase().includes("euro");
    if (aIsEuro && !bIsEuro) return 1;
    if (!aIsEuro && bIsEuro) return -1;
    return a.code.localeCompare(b.code);
  });
}
