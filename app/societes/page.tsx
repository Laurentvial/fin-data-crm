"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Company } from "@/lib/types";

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
  menuOpen,
  onMenuToggle,
  onEdit,
  onDelete,
  onCardClick,
}: {
  company: Company;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
  onCardClick: (companyId: string) => void;
}) {
  const [logoError, setLogoError] = useState(false);
  const phone = "phone" in company ? (company as { phone?: string }).phone : undefined;

  return (
    <div
      className="relative flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition-shadow hover:shadow-md"
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
        {logoError ? (
          <span className="text-sm font-semibold text-[var(--muted-foreground)]">
            {getInitials(company.name)}
          </span>
        ) : (
          <img
            src={`/api/accounts/${company.id}/files/logo`}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setLogoError(true)}
          />
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
          <div>
            <dt className="sr-only">Tél</dt>
            <dd>{phone ?? "—"}</dd>
          </div>
        </dl>
        {(company.bank_ids?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {company.bank_ids!.map((bankId) => (
              <span
                key={bankId}
                className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]"
                title="Banque"
              >
                <img
                  src={`/api/banks/${bankId}/files/logo`}
                  alt=""
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </span>
            ))}
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

function CompanyModal({
  title,
  name,
  address,
  siret,
  directeur,
  onNameChange,
  onAddressChange,
  onSiretChange,
  onDirecteurChange,
  onSave,
  onClose,
  saving,
}: {
  title: string;
  name: string;
  address: string;
  siret: string;
  directeur: string;
  onNameChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onSiretChange: (v: string) => void;
  onDirecteurChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">{title}</h3>
        <div className="space-y-4">
          <div>
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
          <div>
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
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Directeur</label>
            <input
              type="text"
              value={directeur}
              onChange={(e) => onDirecteurChange(e.target.value)}
              placeholder="Nom du directeur"
              className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isAddModal, setIsAddModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editSiret, setEditSiret] = useState("");
  const [editDirecteur, setEditDirecteur] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("Échec du chargement");
      const data = await res.json();
      setCompanies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    if (editIdFromUrl && companies.length > 0) {
      const company = companies.find((c) => c.id === editIdFromUrl);
      if (company) {
        setEditingCompany(company);
        setIsAddModal(false);
        setEditName(company.name);
        setEditAddress(company.address ?? "");
        setEditSiret(company.siret ?? "");
        setEditDirecteur(company.directeur ?? "");
        setError(null);
      }
    }
  }, [editIdFromUrl, companies]);

  const openAdd = () => {
    setEditingCompany(null);
    setIsAddModal(true);
    setEditName("");
    setEditAddress("");
    setEditSiret("");
    setEditDirecteur("");
    setError(null);
  };

  const openEdit = (company: Company) => {
    setEditingCompany(company);
    setIsAddModal(false);
    setEditName(company.name);
    setEditAddress(company.address ?? "");
    setEditSiret(company.siret ?? "");
    setEditDirecteur(company.directeur ?? "");
    setError(null);
  };

  const closeModal = () => {
    setEditingCompany(null);
    setIsAddModal(false);
    setMenuOpenId(null);
    setEditName("");
    setEditAddress("");
    setEditSiret("");
    setEditDirecteur("");
    setError(null);
    if (editIdFromUrl) router.replace("/societes");
  };

  const handleSave = async () => {
    const name = editName.trim();
    if (!name) return;
    const payload = {
      name,
      address: editAddress.trim() || null,
      siret: editSiret.trim() || null,
      directeur: editDirecteur.trim() || null,
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
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Échec de la mise à jour");
        }
        const updated = await res.json();
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
    if (!confirm(`Supprimer la société "${company.name}" ?`)) return;
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
    }
  };

  const showModal = isAddModal || editingCompany;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <h1 className="mb-6 text-2xl font-semibold text-[var(--foreground)]">Sociétés</h1>
        <p className="mb-6 text-sm text-[var(--muted-foreground)]">
          Gérez les sociétés. Chaque société peut avoir plusieurs comptes bancaires.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={openAdd}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            Ajouter une société
          </button>
        </div>

        {loading ? (
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        ) : companies.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Aucune société. Cliquez sur « Ajouter une société » pour commencer.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {companies.map((c) => (
              <CompanyCard
                key={c.id}
                company={c}
                menuOpen={menuOpenId === c.id}
                onMenuToggle={() => setMenuOpenId((prev) => (prev === c.id ? null : c.id))}
                onEdit={openEdit}
                onDelete={handleDelete}
                onCardClick={(companyId) => router.push(`/societes/${companyId}/comptes`)}
              />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <CompanyModal
          title={isAddModal ? "Nouvelle société" : "Modifier la société"}
          name={editName}
          address={editAddress}
          siret={editSiret}
          directeur={editDirecteur}
          onNameChange={setEditName}
          onAddressChange={setEditAddress}
          onSiretChange={setEditSiret}
          onDirecteurChange={setEditDirecteur}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
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
