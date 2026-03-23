"use client";

function getStatusColor(status: string): string {
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

export function AccountStatusBadge({
  status,
  emoji,
  className = "",
}: {
  status: string;
  emoji?: string | null;
  className?: string;
}) {
  const colorClass = getStatusColor(status);
  const display = emoji?.trim() ? `${emoji.trim()} ${status}` : status;
  return <span className={`${colorClass} ${className}`}>{display}</span>;
}
