"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SearchableSelectOption = { value: string; label: string };

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SearchableSelect({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder = "Rechercher…",
  ariaLabel,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  emptyLabel: string;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const allChoices = useMemo(() => [{ value: "", label: emptyLabel }, ...options], [emptyLabel, options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allChoices;
    return allChoices.filter((o) => o.label.toLowerCase().includes(q));
  }, [allChoices, query]);

  const displayLabel = useMemo(() => {
    if (value === "") return emptyLabel;
    const hit = options.find((o) => o.value === value);
    return hit?.label ?? value;
  }, [value, emptyLabel, options]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const select = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? "ring-2 ring-[var(--primary)]" : ""
        }`}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-64 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
          role="listbox"
        >
          <div className="shrink-0 border-b border-[var(--border)] p-2">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                  setQuery("");
                }
              }}
              placeholder={placeholder}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              aria-label={`${placeholder} (${ariaLabel})`}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-sm text-[var(--muted-foreground)]">Aucun résultat</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value === "" ? "__empty__" : o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === o.value}
                    onClick={() => select(o.value)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--muted)] ${
                      value === o.value ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]" : "text-[var(--foreground)]"
                    }`}
                  >
                    <span className="line-clamp-2 break-words">{o.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
