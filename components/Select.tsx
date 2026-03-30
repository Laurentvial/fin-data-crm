"use client";

import { suppressNextModalBackdropClose } from "@/lib/modal-backdrop-close";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Select({
  value,
  onChange,
  children,
  className = "",
  ...rest
}: React.ComponentPropsWithoutRef<"select">) {
  const { onBlur: onBlurProp, ...selectRest } = rest;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          suppressNextModalBackdropClose();
          onChange?.(e);
        }}
        onBlur={(e) => {
          suppressNextModalBackdropClose();
          onBlurProp?.(e);
        }}
        className={`block w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 pr-9 text-sm ${className}`}
        {...selectRest}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 shrink-0 text-[var(--muted-foreground)]" />
    </div>
  );
}
