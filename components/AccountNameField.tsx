"use client";

export function AccountNameField({
  value,
  onChange,
  placeholder = "Ex. Compte courant",
  autoFocus,
  className = "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  );
}
