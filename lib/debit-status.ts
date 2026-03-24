export const DEBIT_STATUS_VALUES = ["ok", "a_verifier", "annulee_bloquee"] as const;

export type DebitTransactionStatus = (typeof DEBIT_STATUS_VALUES)[number];

export function isDebitTransactionStatus(v: string): v is DebitTransactionStatus {
  return (DEBIT_STATUS_VALUES as readonly string[]).includes(v);
}

const META: Record<
  DebitTransactionStatus,
  { label: string; bg: string; fg: string }
> = {
  ok: { label: "OK", bg: "#16a34a", fg: "#ffffff" },
  a_verifier: { label: "À vérifier", bg: "#ea580c", fg: "#ffffff" },
  annulee_bloquee: { label: "Annulée / Bloquée", bg: "#dc2626", fg: "#ffffff" },
};

export function debitStatusLabel(v: DebitTransactionStatus | null | undefined): string {
  if (v == null) return "";
  return META[v]?.label ?? "";
}

export function debitStatusPillStyle(
  v: DebitTransactionStatus | null | undefined
): { label: string; bg: string; fg: string } | null {
  if (v == null) return null;
  return META[v] ?? null;
}
