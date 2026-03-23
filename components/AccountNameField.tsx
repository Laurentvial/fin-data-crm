"use client";

import { useEffect, useRef, useState } from "react";

const ACCOUNT_NAME_EMOJIS = [
  { emoji: "❄️", label: "Neige" },
  { emoji: "🏠", label: "Maison" },
  { emoji: "🔴", label: "Point rouge" },
  { emoji: "🟢", label: "Point vert" },
  { emoji: "🏢", label: "Immeuble" },
  { emoji: "🐬", label: "Dauphin" },
  { emoji: "🧿", label: "Nazar" },
  { emoji: "🚫", label: "Stop" },
  { emoji: "⚠️", label: "Danger" },
  { emoji: "🛑", label: "Hexagone rouge" },
] as const;

const EMOJI_LIST = ACCOUNT_NAME_EMOJIS.map((e) => e.emoji);

function parseValue(value: string): { emoji: string; name: string } {
  const trimmed = value.trim();
  for (const emoji of EMOJI_LIST) {
    if (trimmed.startsWith(emoji)) {
      const rest = trimmed.slice(emoji.length).trim();
      return { emoji, name: rest };
    }
  }
  return { emoji: "", name: trimmed };
}

function buildValue(emoji: string, name: string): string {
  const n = name.trim();
  if (emoji && n) return emoji + " " + n;
  if (emoji) return emoji;
  return n;
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { emoji, name } = parseValue(value);

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

  const setEmoji = (e: string) => {
    onChange(buildValue(e, name));
  };

  const setName = (n: string) => {
    onChange(buildValue(emoji, n));
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            title="Choisir un emoji"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] text-2xl leading-none transition-colors hover:bg-[var(--muted)]"
            aria-label="Choisir un emoji"
            aria-expanded={pickerOpen}
          >
            {emoji || "😀"}
          </button>
          {pickerOpen && (
            <div
              className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg"
              role="dialog"
              aria-label="Sélectionner un emoji"
            >
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEmoji("");
                    setPickerOpen(false);
                  }}
                  title="Aucun emoji"
                  className="rounded p-2 text-sm leading-none transition-colors hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
                  aria-label="Aucun emoji"
                >
                  —
                </button>
                {ACCOUNT_NAME_EMOJIS.map(({ emoji: e, label }) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setEmoji(e);
                      setPickerOpen(false);
                    }}
                    title={label}
                    className="rounded p-2 text-xl leading-none transition-colors hover:bg-[var(--muted)]"
                    aria-label={`Choisir ${label}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className={className}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}
