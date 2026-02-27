"use client";

import { useEffect, useRef, useState } from "react";
import type { Bank } from "@/lib/types";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function BankSelect({
  value,
  onChange,
  banks,
  placeholder = "Aucune banque",
  className = "",
}: {
  value: string;
  onChange: (bankId: string) => void;
  banks: Bank[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedBank = value ? banks.find((b) => b.id === value) : null;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-sm"
      >
        {selectedBank ? (
          <>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
              {selectedBank.has_logo ? (
                <img
                  src={`/api/banks/${selectedBank.id}/files/logo`}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
            <span className="flex-1 truncate">{selectedBank.name}</span>
          </>
        ) : (
          <span className="flex-1 text-[var(--muted-foreground)]">{placeholder}</span>
        )}
        <ChevronDownIcon className={`shrink-0 text-[var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
          >
            <span className="flex-1 text-[var(--muted-foreground)]">{placeholder}</span>
          </button>
          {banks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                onChange(b.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]">
                {b.has_logo ? (
                  <img
                    src={`/api/banks/${b.id}/files/logo`}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : null}
              </div>
              <span className="flex-1 truncate">{b.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
