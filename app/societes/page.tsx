"use client";

import { useCallback, useEffect, useState } from "react";
import type { Company } from "@/lib/types";

function CompanyRow({
  company,
  onEdit,
  onDelete,
}: {
  company: Company;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
}) {
  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--muted)]/50">
      <td className="px-4 py-3 font-medium text-[var(--foreground)]">{company.name}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(company)}
            className="rounded px-2 py-1 text-sm text-[var(--primary)] hover:bg-[var(--primary-muted)]"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={() => onDelete(company)}
            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Supprimer
          </button>
        </div>
      </td>
    </tr>
  );
}

function CompanyModal({
  title,
  name,
  onNameChange,
  onSave,
  onClose,
  saving,
}: {
  title: string;
  name: string;
  onNameChange: (v: string) => void;
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

export default function SocietesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isAddModal, setIsAddModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/companies");
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

  const openAdd = () => {
    setEditingCompany(null);
    setIsAddModal(true);
    setEditName("");
    setError(null);
  };

  const openEdit = (company: Company) => {
    setEditingCompany(company);
    setIsAddModal(false);
    setEditName(company.name);
    setError(null);
  };

  const closeModal = () => {
    setEditingCompany(null);
    setIsAddModal(false);
    setEditName("");
    setError(null);
  };

  const handleSave = async () => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      if (isAddModal) {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Échec de la création");
        setCompanies((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      } else if (editingCompany) {
        const res = await fetch(`/api/companies/${editingCompany.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Échec de la mise à jour");
        }
        setCompanies((prev) =>
          prev
            .map((c) => (c.id === editingCompany.id ? { ...c, name, updated_at: new Date().toISOString() } : c))
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
      const res = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
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
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Nom
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <CompanyRow key={c.id} company={c} onEdit={openEdit} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showModal && (
        <CompanyModal
          title={isAddModal ? "Nouvelle société" : "Modifier la société"}
          name={editName}
          onNameChange={setEditName}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      )}
    </div>
  );
}
