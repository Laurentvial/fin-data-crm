export const SPENDING_CATEGORY_VALUES = [
  "META",
  "Ads setup",
  "Domain",
  "Dev",
  "Autre",
] as const;

export type SpendingCategory = (typeof SPENDING_CATEGORY_VALUES)[number];

export function isSpendingCategory(value: string): value is SpendingCategory {
  return (SPENDING_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function spendingCategoryLabel(value: SpendingCategory | null | undefined): string {
  if (!value) return "";
  return value;
}
