"use client";

import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/Select";
import { suppressNextModalBackdropClose } from "@/lib/modal-backdrop-close";

const CUSTOM_VALUE = "__custom__";

export function isValidInvoiceVatRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

export function buildVatRatePresets(companyVatRates: number[]): number[] {
  const rates = companyVatRates
    .map((r) => Number(r))
    .filter(isValidInvoiceVatRate);
  return [...new Set([0, ...rates])].sort((a, b) => a - b);
}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "";
  return String(rate);
}

function parseRateInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "" || trimmed === "." || trimmed === ",") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

type InvoiceVatRateSelectProps = {
  value: number;
  presetRates: number[];
  onChange: (rate: number) => void;
  className?: string;
};

export function InvoiceVatRateSelect({
  value,
  presetRates,
  onChange,
  className = "",
}: InvoiceVatRateSelectProps) {
  const presets = useMemo(() => buildVatRatePresets(presetRates), [presetRates]);
  const [customMode, setCustomMode] = useState(() => !presets.includes(value));
  const [draft, setDraft] = useState(() => formatRate(value));

  // Enter custom mode for orphan/external custom rates only.
  // Never exit custom mode just because `value` matches a preset — that breaks
  // typing intermediates like "0." / "0.5" or "20." / "20.5".
  useEffect(() => {
    if (!presets.includes(value) && isValidInvoiceVatRate(value)) {
      setCustomMode(true);
      setDraft((prev) => {
        const parsed = parseRateInput(prev);
        // Keep in-progress draft text (e.g. "0.") when it already maps to value.
        if (parsed === value) return prev;
        return formatRate(value);
      });
    }
  }, [value, presets]);

  const selectValue = customMode ? CUSTOM_VALUE : String(value);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Select
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM_VALUE) {
            setCustomMode(true);
            setDraft(presets.includes(value) ? "" : formatRate(value));
            if (presets.includes(value) || !isValidInvoiceVatRate(value)) {
              onChange(Number.NaN);
            }
            return;
          }
          setCustomMode(false);
          setDraft(next);
          onChange(Number(next));
        }}
        className="w-full py-1.5 text-sm"
      >
        {presets.map((r) => (
          <option key={r} value={String(r)}>
            {r === 0 ? "0% (hors taxes)" : `${r}%`}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Autre…</option>
      </Select>
      {customMode && (
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder="%"
          onChange={(e) => {
            suppressNextModalBackdropClose();
            const raw = e.target.value.replace(",", ".");
            // Allow incomplete decimal entry while staying in custom mode.
            if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
            setDraft(raw);
            const parsed = parseRateInput(raw);
            if (parsed == null || !isValidInvoiceVatRate(parsed)) {
              onChange(Number.NaN);
              return;
            }
            onChange(parsed);
          }}
          onBlur={() => suppressNextModalBackdropClose()}
          className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-right text-sm"
          aria-label="Taux de TVA personnalisé"
        />
      )}
    </div>
  );
}
