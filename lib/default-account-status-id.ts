import type { AccountStatus } from "@/lib/types";

/** Statut pré-sélectionné à la création d'un compte (★ is_default, sinon premier par ordre). */
export function defaultAccountStatusIdForCreate(statuses: AccountStatus[]): string {
  const starred = statuses.find((s) => s.is_default);
  if (starred?.id) return starred.id;
  const sorted = [...statuses].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
  return sorted[0]?.id ?? "";
}
