"use client";

import { useCallback, useState } from "react";

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IbanCopyRows({ lines }: { lines: string[] }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copy = useCallback(async (display: string, index: number) => {
    const raw = display.replace(/\s/g, "").toUpperCase();
    try {
      await navigator.clipboard.writeText(raw);
      setCopiedIndex(index);
      window.setTimeout(() => {
        setCopiedIndex((prev) => (prev === index ? null : prev));
      }, 1600);
    } catch {
      /* non-HTTPS or permission denied */
    }
  }, []);

  if (!lines.length) return null;

  return (
    <div className="mt-0.5 space-y-0.5">
      {lines.map((iban, i) => (
        <div key={i} className="flex min-h-[1.5rem] items-start gap-0.5">
          <p className="min-w-0 flex-1 break-all text-xs font-mono text-[var(--foreground)]">{iban}</p>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void copy(iban, i);
            }}
            className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            title={copiedIndex === i ? "Copié !" : "Copier l'IBAN"}
            aria-label={copiedIndex === i ? "IBAN copié" : "Copier l'IBAN"}
          >
            {copiedIndex === i ? (
              <CheckIcon className="h-3.5 w-3.5 text-[var(--success)]" />
            ) : (
              <ClipboardIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
