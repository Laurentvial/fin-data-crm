/** Tri initial du tableau (même logique que le chargement par défaut). */
export const DEFAULT_TRANSACTION_TABLE_SORT = {
  column: "transaction_date",
  direction: "desc" as const,
};

export function isDefaultTransactionTableSort(
  sort: { column: string; direction: "asc" | "desc" } | null | undefined
): boolean {
  const s = sort ?? DEFAULT_TRANSACTION_TABLE_SORT;
  return (
    s.column === DEFAULT_TRANSACTION_TABLE_SORT.column &&
    s.direction === DEFAULT_TRANSACTION_TABLE_SORT.direction
  );
}
