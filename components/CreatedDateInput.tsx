"use client";

import { useCallback, useMemo, useRef } from "react";

export function parseFrDateToIsoOrNull(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function formatIsoDateToFr(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function CreatedDateInput({
  value,
  onChange,
  ariaLabel,
  inputClassName,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  inputClassName: string;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const isoValue = useMemo(() => parseFrDateToIsoOrNull(value) ?? "", [value]);

  const openPicker = useCallback(() => {
    const input = pickerRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }, []);

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        placeholder="jj/mm/aaaa"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        aria-label={`${ariaLabel} via calendrier`}
        title="Ouvrir le calendrier"
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={isoValue}
        onChange={(e) => onChange(formatIsoDateToFr(e.target.value))}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
