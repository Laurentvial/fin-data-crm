"use client";

import { suppressNextModalBackdropClose } from "@/lib/modal-backdrop-close";

export function Select({
  value,
  onChange,
  children,
  className = "",
  ...rest
}: React.ComponentPropsWithoutRef<"select">) {
  const { onBlur: onBlurProp, ...selectRest } = rest;
  return (
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
      className={`block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm ${className}`}
      {...selectRest}
    >
      {children}
    </select>
  );
}
