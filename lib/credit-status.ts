export const CREDIT_STATUS_VALUES = ["paye"] as const;

export type CreditTransactionStatus = (typeof CREDIT_STATUS_VALUES)[number];

export function isCreditTransactionStatus(v: string): v is CreditTransactionStatus {
  return (CREDIT_STATUS_VALUES as readonly string[]).includes(v);
}

const META: Record<
  CreditTransactionStatus,
  { label: string; bg: string; fg: string }
> = {
  paye: { label: "Payé", bg: "#16a34a", fg: "#ffffff" },
};

export function creditStatusLabel(v: CreditTransactionStatus | null | undefined): string {
  if (v == null) return "";
  return META[v]?.label ?? "";
}

export function creditStatusPillStyle(
  v: CreditTransactionStatus | null | undefined
): { label: string; bg: string; fg: string } | null {
  if (v == null) return null;
  return META[v] ?? null;
}
