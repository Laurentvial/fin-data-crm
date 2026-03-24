"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { Select } from "@/components/Select";
import type { Bank, Company, Source } from "@/lib/types";
import { getDefaultVatRateForCountry, getVatRatesForCountry } from "@/lib/vat-rates";

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Convert ISO date (yyyy-mm-dd) to display format (dd/mm/yyyy) */
function formatDateToDisplay(iso: string): string {
  if (!iso?.trim()) return "";
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso; // already dd/mm/yyyy or invalid
}

/** Convert display format (dd/mm/yyyy) to ISO (yyyy-mm-dd) */
function formatDateToIso(display: string): string {
  if (!display?.trim()) return "";
  const m = display.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const day = d.padStart(2, "0");
    const month = mo.padStart(2, "0");
    return `${y}-${month}-${day}`;
  }
  return display;
}

/** Format date input as user types: dd/mm/yyyy */
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function CompanyCard({
  company,
  banks,
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
  onCardClick,
}: {
  company: Company;
  banks: Bank[];
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
  onCardClick: (companyId: string) => void;
}) {
  return (
    <div
      className="relative flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--card-shadow)] transition-all hover:shadow-[var(--card-hover-shadow)] hover:border-[var(--primary-muted-border)]"
      onClick={() => onCardClick(company.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCardClick(company.id);
        }
      }}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]">
        {company.has_logo ? (
          <img
            src={`/api/accounts/${company.id}/files/logo`}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-sm font-semibold text-[var(--muted-foreground)]">
            {getInitials(company.name)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[var(--foreground)] truncate">{company.name}</h3>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMenuToggle();
            }}
            className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Menu"
          >
            <MoreVerticalIcon />
          </button>
        </div>
        <dl className="mt-1 space-y-0.5 text-xs text-[var(--muted-foreground)]">
          <div>
            <dt className="sr-only">Directeur</dt>
            <dd>{company.directeur ?? "—"}</dd>
          </div>
          <div>
            <dt className="sr-only">Adresse</dt>
            <dd className="truncate">{company.address ?? "—"}</dd>
          </div>
          <div>
            <dt className="sr-only">SIRET</dt>
            <dd>{company.siret ?? "—"}</dd>
          </div>
          {(company.emails?.length ?? 0) > 0 && (
            <div>
              <dt className="sr-only">Emails</dt>
              <dd className="truncate">{company.emails!.slice(0, 2).join(", ")}</dd>
            </div>
          )}
          {(company.phones?.length ?? 0) > 0 && (
            <div>
              <dt className="sr-only">Tél</dt>
              <dd className="truncate">{company.phones!.slice(0, 2).join(", ")}</dd>
            </div>
          )}
        </dl>
        {(company.bank_ids?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {company.bank_ids!.map((bankId) => {
              const bank = banks.find((b) => b.id === bankId);
              if (!bank?.has_logo) return null;
              return (
                <span
                  key={bankId}
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]"
                  title="Banque"
                >
                  <img
                    src={`/api/banks/${bankId}/files/logo`}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                </span>
              );
            })}
          </div>
        )}
      </div>
      {menuOpen && (
        <CompanyCardMenu
          company={company}
          onClose={onMenuToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function CompanyCardMenu({
  company,
  onClose,
  onEdit,
  onDelete,
}: {
  company: Company;
  onClose: () => void;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        className="absolute right-2 top-12 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/societes/${company.id}`}
          onClick={onClose}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <ExternalLinkIcon />
          Voir informations
        </Link>
        <button
          type="button"
          onClick={() => {
            onClose();
            onEdit(company);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          <PencilIcon />
          Modifier
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onDelete(company);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-[var(--muted)] dark:text-red-400"
        >
          <TrashIcon />
          Supprimer
        </button>
      </div>
    </>
  );
}

const INVOICE_COUNTRIES = [
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgique" },
  { code: "CH", label: "Suisse" },
  { code: "PT", label: "Portugal" },
  { code: "ES", label: "Espagne" },
  { code: "US", label: "États-Unis" },
  { code: "IT", label: "Italie" },
  { code: "PL", label: "Pologne" },
  { code: "RO", label: "Roumanie" },
];

function CompanyModal({
  title,
  name,
  address,
  sourceId,
  sources,
  siret,
  directeur,
  website,
  vps,
  formeJuridique,
  capitalSocial,
  codePostal,
  ville,
  activite,
  dateImmatriculation,
  countryCode,
  gerantAdresse,
  gerantCodePostal,
  gerantVille,
  gerantPays,
  gerantDateNaissance,
  gerantVilleNaissance,
  gerantCodePostalNaissance,
  gerantPaysNaissance,
  gerantNumeroFiscal,
  gerantNumeroSecu,
  gerantNumeroPieceIdentite,
  vatNumber,
  vatRates,
  invoicePrefix,
  invoiceNextNumber,
  currency,
  onNameChange,
  onAddressChange,
  onSourceIdChange,
  onSiretChange,
  onDirecteurChange,
  onWebsiteChange,
  onVpsChange,
  onFormeJuridiqueChange,
  onCapitalSocialChange,
  onCodePostalChange,
  onVilleChange,
  onActiviteChange,
  onDateImmatriculationChange,
  onCountryCodeChange,
  onGerantAdresseChange,
  onGerantCodePostalChange,
  onGerantVilleChange,
  onGerantPaysChange,
  onGerantDateNaissanceChange,
  onGerantVilleNaissanceChange,
  onGerantCodePostalNaissanceChange,
  onGerantPaysNaissanceChange,
  onGerantNumeroFiscalChange,
  onGerantNumeroSecuChange,
  onGerantNumeroPieceIdentiteChange,
  onVatNumberChange,
  onVatRatesChange,
  onInvoicePrefixChange,
  onInvoiceNextNumberChange,
  onCurrencyChange,
  onSave,
  onClose,
  saving,
  isEdit,
}: {
  title: string;
  name: string;
  address: string;
  sourceId: string;
  sources: Source[];
  siret: string;
  directeur: string;
  website: string;
  vps: string;
  formeJuridique: string;
  capitalSocial: string;
  codePostal: string;
  ville: string;
  activite: string;
  dateImmatriculation: string;
  countryCode: string;
  gerantAdresse: string;
  gerantCodePostal: string;
  gerantVille: string;
  gerantPays: string;
  gerantDateNaissance: string;
  gerantVilleNaissance: string;
  gerantCodePostalNaissance: string;
  gerantPaysNaissance: string;
  gerantNumeroFiscal: string;
  gerantNumeroSecu: string;
  gerantNumeroPieceIdentite: string;
  vatNumber: string;
  vatRates: number[];
  invoicePrefix: string;
  invoiceNextNumber: string;
  currency: string;
  onNameChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onSourceIdChange: (v: string) => void;
  onSiretChange: (v: string) => void;
  onDirecteurChange: (v: string) => void;
  onWebsiteChange: (v: string) => void;
  onVpsChange: (v: string) => void;
  onFormeJuridiqueChange: (v: string) => void;
  onCapitalSocialChange: (v: string) => void;
  onCodePostalChange: (v: string) => void;
  onVilleChange: (v: string) => void;
  onActiviteChange: (v: string) => void;
  onDateImmatriculationChange: (v: string) => void;
  onCountryCodeChange?: (v: string) => void;
  onGerantAdresseChange: (v: string) => void;
  onGerantCodePostalChange: (v: string) => void;
  onGerantVilleChange: (v: string) => void;
  onGerantPaysChange: (v: string) => void;
  onGerantDateNaissanceChange: (v: string) => void;
  onGerantVilleNaissanceChange: (v: string) => void;
  onGerantCodePostalNaissanceChange: (v: string) => void;
  onGerantPaysNaissanceChange: (v: string) => void;
  onGerantNumeroFiscalChange: (v: string) => void;
  onGerantNumeroSecuChange: (v: string) => void;
  onGerantNumeroPieceIdentiteChange: (v: string) => void;
  onVatNumberChange?: (v: string) => void;
  onVatRatesChange?: (v: number[]) => void;
  onInvoicePrefixChange?: (v: string) => void;
  onInvoiceNextNumberChange?: (v: string) => void;
  onCurrencyChange?: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  isEdit: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
      >
        <h3 className="subsection-header mb-4 text-lg font-medium">{title}</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Nom de la société"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div className="col-span-3">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Adresse</label>
            <input
              type="text"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Adresse"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Code postal</label>
            <input
              type="text"
              value={codePostal}
              onChange={(e) => onCodePostalChange(e.target.value)}
              placeholder="Code postal"
              maxLength={10}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Ville</label>
            <input
              type="text"
              value={ville}
              onChange={(e) => onVilleChange(e.target.value)}
              placeholder="Ville"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Pays</label>
            <Select
              value={countryCode}
              onChange={(e) => onCountryCodeChange?.(e.target.value)}
            >
              {INVOICE_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Siret</label>
            <input
              type="text"
              value={siret}
              onChange={(e) => onSiretChange(e.target.value)}
              placeholder="Siret (14 chiffres)"
              maxLength={14}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Forme juridique</label>
            <input
              type="text"
              value={formeJuridique}
              onChange={(e) => onFormeJuridiqueChange(e.target.value)}
              placeholder="SARL, SAS, SA, etc."
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Capital social</label>
            <input
              type="text"
              value={capitalSocial}
              onChange={(e) => onCapitalSocialChange(e.target.value)}
              placeholder="Ex: 1 000 €"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">VPS</label>
            <input
              type="text"
              value={vps}
              onChange={(e) => onVpsChange(e.target.value)}
              placeholder="VPS"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Activité de la société</label>
            <input
              type="text"
              value={activite}
              onChange={(e) => onActiviteChange(e.target.value)}
              placeholder="Activité principale"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Date d&apos;immatriculation</label>
            <input
              type="text"
              value={dateImmatriculation}
              onChange={(e) => onDateImmatriculationChange(formatDateInput(e.target.value))}
              placeholder="jj/mm/aaaa"
              maxLength={10}
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Site web</label>
            <input
              type="url"
              value={website}
              onChange={(e) => onWebsiteChange(e.target.value)}
              placeholder="https://exemple.com"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Source</label>
            <Select
              value={sourceId}
              onChange={(e) => onSourceIdChange(e.target.value)}
            >
              <option value="">Aucune source</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-3 border-t border-[var(--border)] pt-4 mt-4">
            <h4 className="subsection-header mb-3 text-sm font-medium">Gérant</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3">
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Nom du directeur</label>
                <input
                  type="text"
                  value={directeur}
                  onChange={(e) => onDirecteurChange(e.target.value)}
                  placeholder="Nom du gérant"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-3">
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Adresse personnelle</label>
                <input
                  type="text"
                  value={gerantAdresse}
                  onChange={(e) => onGerantAdresseChange(e.target.value)}
                  placeholder="Adresse personnelle"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Code postal</label>
                <input
                  type="text"
                  value={gerantCodePostal}
                  onChange={(e) => onGerantCodePostalChange(e.target.value)}
                  placeholder="Code postal"
                  maxLength={10}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Ville</label>
                <input
                  type="text"
                  value={gerantVille}
                  onChange={(e) => onGerantVilleChange(e.target.value)}
                  placeholder="Ville"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Pays</label>
                <Select
                  value={gerantPays || ""}
                  onChange={(e) => onGerantPaysChange(e.target.value || "")}
                >
                  <option value="">—</option>
                  {INVOICE_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Date de naissance</label>
                <input
                  type="text"
                  value={gerantDateNaissance}
                  onChange={(e) => onGerantDateNaissanceChange(formatDateInput(e.target.value))}
                  placeholder="jj/mm/aaaa"
                  maxLength={10}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Ville de naissance</label>
                <input
                  type="text"
                  value={gerantVilleNaissance}
                  onChange={(e) => onGerantVilleNaissanceChange(e.target.value)}
                  placeholder="Ville de naissance"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Code postal de naissance</label>
                <input
                  type="text"
                  value={gerantCodePostalNaissance}
                  onChange={(e) => onGerantCodePostalNaissanceChange(e.target.value)}
                  placeholder="Code postal"
                  maxLength={10}
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Pays de naissance</label>
                <Select
                  value={gerantPaysNaissance || ""}
                  onChange={(e) => onGerantPaysNaissanceChange(e.target.value || "")}
                >
                  <option value="">—</option>
                  {INVOICE_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">N° fiscal</label>
                <input
                  type="text"
                  value={gerantNumeroFiscal}
                  onChange={(e) => onGerantNumeroFiscalChange(e.target.value)}
                  placeholder="Numéro fiscal"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">N° sécurité sociale</label>
                <input
                  type="text"
                  value={gerantNumeroSecu}
                  onChange={(e) => onGerantNumeroSecuChange(e.target.value)}
                  placeholder="1 XX XX XX XXX XX"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">N° pièce d&apos;identité</label>
                <input
                  type="text"
                  value={gerantNumeroPieceIdentite}
                  onChange={(e) => onGerantNumeroPieceIdentiteChange(e.target.value)}
                  placeholder="Numéro pièce d'identité"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="col-span-3 border-t border-[var(--border)] pt-4 mt-4">
            <h4 className="subsection-header mb-3 text-sm font-medium">Facturation</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">N° TVA</label>
                    <input
                      type="text"
                      value={vatNumber}
                      onChange={(e) => onVatNumberChange?.(e.target.value)}
                      placeholder="TVA intracommunautaire"
                      className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Taux TVA (%)</label>
                    <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                      Taux disponibles selon le pays. Sélectionnez ceux que vous utilisez.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {getVatRatesForCountry(countryCode).map((rate) => {
                        const isSelected = vatRates.includes(rate);
                        return (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              const next = isSelected
                                ? vatRates.filter((r) => r !== rate)
                                : [...vatRates, rate].sort((a, b) => a - b);
                              if (next.length > 0) onVatRatesChange?.(next);
                            }}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                              isSelected
                                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                                : "border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:border-[var(--primary-muted-border)]"
                            }`}
                          >
                            {rate}%
                          </button>
                        );
                      })}
                    </div>
                    {vatRates.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600">Sélectionnez au moins un taux.</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Préfixe factures</label>
                    <input
                      type="text"
                      value={invoicePrefix}
                      onChange={(e) => onInvoicePrefixChange?.(e.target.value)}
                      placeholder="FAC-"
                      className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Prochain numéro de facture</label>
                    <input
                      type="number"
                      value={invoiceNextNumber}
                      onChange={(e) => onInvoiceNextNumberChange?.(e.target.value)}
                      placeholder="1"
                      min="1"
                      className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      La prochaine facture sera {invoicePrefix || "FAC-"}{new Date().getFullYear()}-{String(invoiceNextNumber || "1").padStart(4, "0")}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">Devise</label>
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) => onCurrencyChange?.(e.target.value)}
                      placeholder="EUR"
                      maxLength={3}
                      className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !name.trim()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SocietesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdFromUrl = searchParams.get("edit");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [companyDeleting, setCompanyDeleting] = useState(false);
  const [isAddModal, setIsAddModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editSourceId, setEditSourceId] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [editSiret, setEditSiret] = useState("");
  const [editDirecteur, setEditDirecteur] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editVps, setEditVps] = useState("");
  const [editFormeJuridique, setEditFormeJuridique] = useState("");
  const [editCapitalSocial, setEditCapitalSocial] = useState("");
  const [editCodePostal, setEditCodePostal] = useState("");
  const [editVille, setEditVille] = useState("");
  const [editActivite, setEditActivite] = useState("");
  const [editDateImmatriculation, setEditDateImmatriculation] = useState("");
  const [editCountryCode, setEditCountryCode] = useState("FR");
  const [editGerantAdresse, setEditGerantAdresse] = useState("");
  const [editGerantCodePostal, setEditGerantCodePostal] = useState("");
  const [editGerantVille, setEditGerantVille] = useState("");
  const [editGerantPays, setEditGerantPays] = useState("");
  const [editGerantDateNaissance, setEditGerantDateNaissance] = useState("");
  const [editGerantVilleNaissance, setEditGerantVilleNaissance] = useState("");
  const [editGerantCodePostalNaissance, setEditGerantCodePostalNaissance] = useState("");
  const [editGerantPaysNaissance, setEditGerantPaysNaissance] = useState("");
  const [editGerantNumeroFiscal, setEditGerantNumeroFiscal] = useState("");
  const [editGerantNumeroSecu, setEditGerantNumeroSecu] = useState("");
  const [editGerantNumeroPieceIdentite, setEditGerantNumeroPieceIdentite] = useState("");
  const [editVatNumber, setEditVatNumber] = useState("");
  const [editVatRates, setEditVatRates] = useState<number[]>([20]);
  const [editInvoicePrefix, setEditInvoicePrefix] = useState("FAC-");
  const [editInvoiceNextNumber, setEditInvoiceNextNumber] = useState("1");
  const [editCurrency, setEditCurrency] = useState("EUR");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      (c.name ?? "").toLowerCase().includes(q)
    );
  }, [companies, search]);

  const companiesByLetter = useMemo(() => {
    const map: Record<string, Company[]> = {};
    for (const c of filteredCompanies) {
      const first = (c.name ?? "").trim().charAt(0).toUpperCase();
      const key = /[A-Z]/.test(first) ? first : "#";
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    }
    return map;
  }, [filteredCompanies]);

  const sortedLetters = useMemo(() => {
    const letters = Object.keys(companiesByLetter);
    return letters.sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  }, [companiesByLetter]);

  const [openLetters, setOpenLetters] = useState<Set<string>>(new Set());
  const toggleLetter = (letter: string) => {
    setOpenLetters((prev) => {
      const next = new Set(prev);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  };

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resAccounts, resBanks, resSources] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/banks"),
        fetch("/api/sources"),
      ]);
      if (!resAccounts.ok) throw new Error("Échec du chargement");
      const data = await resAccounts.json();
      setCompanies(data);
      if (resBanks.ok) {
        const banksData = await resBanks.json();
        setBanks(Array.isArray(banksData) ? banksData : []);
      }
      if (resSources.ok) {
        const sourcesData = await resSources.json();
        setSources(Array.isArray(sourcesData) ? sourcesData : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const populateEditForm = useCallback((c: Company) => {
    setEditName(c.name);
    setEditAddress(c.address ?? "");
    setEditSourceId(c.source_id ?? "");
    setEditSiret(c.siret ?? "");
    setEditDirecteur(c.directeur ?? "");
    setEditWebsite(c.website ?? "");
    setEditVps(c.vps ?? "");
    setEditFormeJuridique(c.forme_juridique ?? "");
    setEditCapitalSocial(c.capital_social ?? "");
    setEditCodePostal(c.code_postal ?? "");
    setEditVille(c.ville ?? "");
    setEditActivite(c.activite ?? "");
    setEditDateImmatriculation(formatDateToDisplay(c.date_immatriculation ?? ""));
    setEditCountryCode(c.country_code ?? "FR");
    setEditGerantAdresse(c.gerant_adresse ?? "");
    setEditGerantCodePostal(c.gerant_code_postal ?? "");
    setEditGerantVille(c.gerant_ville ?? "");
    setEditGerantPays(c.gerant_pays ?? "");
    setEditGerantDateNaissance(formatDateToDisplay(c.gerant_date_naissance ?? ""));
    setEditGerantVilleNaissance(c.gerant_ville_naissance ?? "");
    setEditGerantCodePostalNaissance(c.gerant_code_postal_naissance ?? "");
    setEditGerantPaysNaissance(c.gerant_pays_naissance ?? "");
    setEditGerantNumeroFiscal(c.gerant_numero_fiscal ?? "");
    setEditGerantNumeroSecu(c.gerant_numero_secu ?? "");
    setEditGerantNumeroPieceIdentite(c.gerant_numero_piece_identite ?? "");
    setEditVatNumber(c.vat_number ?? "");
    setEditVatRates(
      Array.isArray(c.vat_rates) && c.vat_rates.length > 0
        ? c.vat_rates
        : c.vat_rate != null
          ? [c.vat_rate]
          : [20]
    );
    setEditInvoicePrefix(c.invoice_prefix ?? "FAC-");
    setEditInvoiceNextNumber(String(c.invoice_next_number ?? 1));
    setEditCurrency(c.currency ?? "EUR");
  }, []);

  useEffect(() => {
    if (!editIdFromUrl || companies.length === 0) return;
    const company = companies.find((c) => c.id === editIdFromUrl);
    if (!company) return;
    setEditingCompany(company);
    setIsAddModal(false);
    setError(null);
    populateEditForm(company);
    let cancelled = false;
    fetch(`/api/accounts/${editIdFromUrl}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((fresh) => {
        if (cancelled || !fresh) return;
        populateEditForm(fresh);
        setEditingCompany((prev) => (prev ? { ...prev, ...fresh } : prev));
      })
      .catch(() => { /* keep form populated from company */ });
    return () => { cancelled = true; };
  }, [editIdFromUrl, companies, populateEditForm]);

  const openAdd = () => {
    setEditingCompany(null);
    setIsAddModal(true);
    setEditName("");
    setEditAddress("");
    setEditSourceId("");
    setEditSiret("");
    setEditDirecteur("");
    setEditWebsite("");
    setEditVps("");
    setEditFormeJuridique("");
    setEditCapitalSocial("");
    setEditCodePostal("");
    setEditVille("");
    setEditActivite("");
    setEditDateImmatriculation("");
    setEditCountryCode("FR");
    setEditGerantAdresse("");
    setEditGerantCodePostal("");
    setEditGerantVille("");
    setEditGerantPays("");
    setEditGerantDateNaissance("");
    setEditGerantVilleNaissance("");
    setEditGerantCodePostalNaissance("");
    setEditGerantPaysNaissance("");
    setEditGerantNumeroFiscal("");
    setEditGerantNumeroSecu("");
    setEditGerantNumeroPieceIdentite("");
    setEditVatNumber("");
    setEditVatRates([20]);
    setEditInvoicePrefix("FAC-");
    setEditInvoiceNextNumber("1");
    setEditCurrency("EUR");
    setError(null);
  };

  const openEdit = async (company: Company) => {
    setEditingCompany(company);
    setIsAddModal(false);
    setError(null);
    populateEditForm(company);
    try {
      const res = await fetch(`/api/accounts/${company.id}`);
      const fresh = res.ok ? await res.json() : null;
      if (fresh) {
        populateEditForm(fresh);
        setEditingCompany((prev) => (prev ? { ...prev, ...fresh } : prev));
      }
    } catch {
      /* keep form populated from company */
    }
  };

  const closeModal = () => {
    setEditingCompany(null);
    setIsAddModal(false);
    setMenuOpenId(null);
    setEditName("");
    setEditAddress("");
    setEditSourceId("");
    setEditSiret("");
    setEditDirecteur("");
    setEditWebsite("");
    setEditVps("");
    setEditFormeJuridique("");
    setEditCapitalSocial("");
    setEditCodePostal("");
    setEditVille("");
    setEditActivite("");
    setEditDateImmatriculation("");
    setEditCountryCode("FR");
    setEditGerantAdresse("");
    setEditGerantCodePostal("");
    setEditGerantVille("");
    setEditGerantPays("");
    setEditGerantDateNaissance("");
    setEditGerantVilleNaissance("");
    setEditGerantCodePostalNaissance("");
    setEditGerantPaysNaissance("");
    setEditGerantNumeroFiscal("");
    setEditGerantNumeroSecu("");
    setEditGerantNumeroPieceIdentite("");
    setEditVatNumber("");
    setEditVatRates([20]);
    setEditInvoicePrefix("FAC-");
    setEditInvoiceNextNumber("1");
    setEditCurrency("EUR");
    setError(null);
    if (editIdFromUrl) router.replace("/societes");
  };

  const handleSave = async () => {
    const name = editName.trim();
    if (!name) return;
    const payload: Record<string, unknown> = {
      name,
      address: editAddress.trim() || null,
      source_id: editSourceId.trim() || null,
      siret: editSiret.trim() || null,
      directeur: editDirecteur.trim() || null,
      website: editWebsite.trim() || null,
      vps: editVps.trim() || null,
      forme_juridique: editFormeJuridique.trim() || null,
      capital_social: editCapitalSocial.trim() || null,
      code_postal: editCodePostal.trim() || null,
      ville: editVille.trim() || null,
      activite: editActivite.trim() || null,
      date_immatriculation: formatDateToIso(editDateImmatriculation) || null,
      country_code: editCountryCode || "FR",
      gerant_adresse: editGerantAdresse.trim() || null,
      gerant_code_postal: editGerantCodePostal.trim() || null,
      gerant_ville: editGerantVille.trim() || null,
      gerant_pays: editGerantPays.trim() || null,
      gerant_date_naissance: formatDateToIso(editGerantDateNaissance) || null,
      gerant_ville_naissance: editGerantVilleNaissance.trim() || null,
      gerant_code_postal_naissance: editGerantCodePostalNaissance.trim() || null,
      gerant_pays_naissance: editGerantPaysNaissance.trim() || null,
      gerant_numero_fiscal: editGerantNumeroFiscal.trim() || null,
      gerant_numero_secu: editGerantNumeroSecu.trim() || null,
      gerant_numero_piece_identite: editGerantNumeroPieceIdentite.trim() || null,
      vat_number: editVatNumber.trim() || null,
      vat_rates: editVatRates.length > 0 ? editVatRates : [getDefaultVatRateForCountry(editCountryCode || "FR")],
      invoice_prefix: editInvoicePrefix.trim() || "FAC-",
      invoice_next_number: (() => {
        const nextNum = parseInt(editInvoiceNextNumber, 10);
        return !Number.isNaN(nextNum) && nextNum >= 1 ? nextNum : 1;
      })(),
      currency: editCurrency.trim().slice(0, 3).toUpperCase() || "EUR",
    };
    setSaving(true);
    setError(null);
    try {
      if (isAddModal) {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Échec de la création");
        setCompanies((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      } else if (editingCompany) {
        const res = await fetch(`/api/accounts/${editingCompany.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Échec de la mise à jour");
        }
        const updated = data;
        setCompanies((prev) =>
          prev
            .map((c) => (c.id === editingCompany.id ? { ...c, ...updated } : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (company: Company) => {
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${company.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setCompanies((prev) => prev.filter((c) => c.id !== company.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      throw e;
    }
  };

  const showModal = isAddModal || editingCompany;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-muted)] text-[var(--primary)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <div>
              <h1 className="page-title text-2xl font-semibold">Sociétés</h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                Gérez les sociétés. Chaque société peut avoir plusieurs comptes bancaires.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {companies.length > 0 && (
              <input
                type="search"
                placeholder="Rechercher par nom de société…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                aria-label="Rechercher par nom de société"
              />
            )}
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-sm"
            >
              + Créer une société
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--destructive-muted)] bg-[var(--destructive-muted)]/50 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        ) : companies.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Aucune société. Cliquez sur « Ajouter une société » pour commencer.</p>
        ) : filteredCompanies.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">
            Aucune société ne correspond à « {search} ».
          </p>
        ) : (
          <div className="space-y-2">
            {sortedLetters.map((letter) => {
              const list = companiesByLetter[letter];
              const isOpen = openLetters.has(letter);
              return (
                <div
                  key={letter}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)]"
                >
                  <button
                    type="button"
                    onClick={() => toggleLetter(letter)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/50 transition-colors ${
                      isOpen ? "rounded-t-xl" : "rounded-xl"
                    }`}
                    aria-expanded={isOpen}
                  >
                    <span className="text-lg">
                      {letter === "#" ? "Autres (0-9, symboles)" : letter}
                    </span>
                    <span className="text-sm font-normal text-[var(--muted-foreground)]">
                      {list.length} société{list.length > 1 ? "s" : ""}
                    </span>
                    <ChevronDownIcon
                      className={`shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="rounded-b-xl border-t border-[var(--border)] p-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                        {list.map((c) => (
                          <CompanyCard
                            key={c.id}
                            company={c}
                            banks={banks}
                            menuOpen={menuOpenId === c.id}
                            onMenuToggle={() => setMenuOpenId((prev) => (prev === c.id ? null : c.id))}
                            onEdit={openEdit}
                            onDelete={(company) => {
                              setCompanyToDelete(company);
                              setMenuOpenId(null);
                            }}
                            onCardClick={(companyId) => router.push(`/societes/${companyId}/comptes`)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {companyToDelete && (
        <DeleteConfirmationModal
          title="Supprimer la société"
          expectedText={`supprimer ${companyToDelete.name}`}
          message="Cette action est irréversible."
          onConfirm={async () => {
            setCompanyDeleting(true);
            try {
              await handleDelete(companyToDelete);
              setCompanyToDelete(null);
            } finally {
              setCompanyDeleting(false);
            }
          }}
          onClose={() => setCompanyToDelete(null)}
          deleting={companyDeleting}
        />
      )}

      {showModal && (
        <CompanyModal
          title={isAddModal ? "Nouvelle société" : "Modifier la société"}
          name={editName}
          address={editAddress}
          sourceId={editSourceId}
          sources={sources}
          onSourceIdChange={setEditSourceId}
          siret={editSiret}
          directeur={editDirecteur}
          website={editWebsite}
          vps={editVps}
          formeJuridique={editFormeJuridique}
          capitalSocial={editCapitalSocial}
          codePostal={editCodePostal}
          ville={editVille}
          activite={editActivite}
          dateImmatriculation={editDateImmatriculation}
          onWebsiteChange={setEditWebsite}
          onVpsChange={setEditVps}
          onFormeJuridiqueChange={setEditFormeJuridique}
          onCapitalSocialChange={setEditCapitalSocial}
          onCodePostalChange={setEditCodePostal}
          onVilleChange={setEditVille}
          onActiviteChange={setEditActivite}
          onDateImmatriculationChange={setEditDateImmatriculation}
          countryCode={editCountryCode}
          gerantAdresse={editGerantAdresse}
          gerantCodePostal={editGerantCodePostal}
          gerantVille={editGerantVille}
          gerantPays={editGerantPays}
          gerantDateNaissance={editGerantDateNaissance}
          gerantVilleNaissance={editGerantVilleNaissance}
          gerantCodePostalNaissance={editGerantCodePostalNaissance}
          gerantPaysNaissance={editGerantPaysNaissance}
          gerantNumeroFiscal={editGerantNumeroFiscal}
          gerantNumeroSecu={editGerantNumeroSecu}
          gerantNumeroPieceIdentite={editGerantNumeroPieceIdentite}
          onGerantAdresseChange={setEditGerantAdresse}
          onGerantCodePostalChange={setEditGerantCodePostal}
          onGerantVilleChange={setEditGerantVille}
          onGerantPaysChange={setEditGerantPays}
          onGerantDateNaissanceChange={setEditGerantDateNaissance}
          onGerantVilleNaissanceChange={setEditGerantVilleNaissance}
          onGerantCodePostalNaissanceChange={setEditGerantCodePostalNaissance}
          onGerantPaysNaissanceChange={setEditGerantPaysNaissance}
          onGerantNumeroFiscalChange={setEditGerantNumeroFiscal}
          onGerantNumeroSecuChange={setEditGerantNumeroSecu}
          onGerantNumeroPieceIdentiteChange={setEditGerantNumeroPieceIdentite}
          vatNumber={editVatNumber}
          vatRates={editVatRates}
          invoicePrefix={editInvoicePrefix}
          invoiceNextNumber={editInvoiceNextNumber}
          currency={editCurrency}
          onNameChange={setEditName}
          onAddressChange={setEditAddress}
          onSiretChange={setEditSiret}
          onDirecteurChange={setEditDirecteur}
          onCountryCodeChange={setEditCountryCode}
          onVatNumberChange={setEditVatNumber}
          onVatRatesChange={setEditVatRates}
          onInvoicePrefixChange={setEditInvoicePrefix}
          onInvoiceNextNumberChange={setEditInvoiceNextNumber}
          onCurrencyChange={setEditCurrency}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
          isEdit={!!editingCompany}
        />
      )}
    </div>
  );
}

export default function SocietesPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen flex-col p-6"><p className="text-[var(--muted-foreground)]">Chargement…</p></div>}>
      <SocietesPageContent />
    </Suspense>
  );
}
