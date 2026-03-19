"use client";

import { useRef, useState, useEffect } from "react";

const ACCOUNT_NAME_EMOJIS = [
  { emoji: "❄️", label: "Neige" },
  { emoji: "🏠", label: "Maison" },
  { emoji: "🔴", label: "Point rouge" },
  { emoji: "🟢", label: "Point vert" },
  { emoji: "🏢", label: "Immeuble" },
  { emoji: "🐬", label: "Dauphin" },
  { emoji: "🧿", label: "Nazar" },
] as const;

export function AccountNameField({
  value,
  onChange,
  placeholder = "Ex. Compte courant",
  autoFocus,
  className = "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-3 pr-10 text-sm",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const next = value.slice(0, start) + emoji + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        input.focus();
        const pos = start + emoji.length;
        input.setSelectionRange(pos, pos);
      });
    } else {
      onChange(value + emoji);
    }
    setPickerOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          title="Insérer un emoji"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-lg leading-none text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Ouvrir le sélecteur d'emoji"
          aria-expanded={pickerOpen}
        >
          😀
        </button>
      </div>
      {pickerOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg"
          role="dialog"
          aria-label="Sélectionner un emoji"
        >
          <div className="flex flex-wrap gap-1">
            {ACCOUNT_NAME_EMOJIS.map(({ emoji, label }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                title={label}
                className="rounded p-2 text-xl leading-none transition-colors hover:bg-[var(--muted)]"
                aria-label={`Insérer ${label}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
