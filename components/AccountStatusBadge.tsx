"use client";

import type { AccountStatus } from "@/lib/types";

function getStatusColor(status: AccountStatus): string {
  switch (status) {
    case "Ouvert":
      return "text-green-600 dark:text-green-400";
    case "Fermé":
      return "text-red-600 dark:text-red-400";
    case "Problème":
      return "text-orange-600 dark:text-orange-400";
    default:
      return "text-[var(--muted-foreground)]";
  }
}

export function AccountStatusBadge({ status, className = "" }: { status: AccountStatus; className?: string }) {
  const colorClass = getStatusColor(status);
  return <span className={`${colorClass} ${className}`}>{status}</span>;
}
