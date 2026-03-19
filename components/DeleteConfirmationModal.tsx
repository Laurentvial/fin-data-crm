"use client";

import { useState, useEffect } from "react";

export interface DeleteConfirmationModalProps {
  /** Texte exact que l'utilisateur doit taper pour confirmer */
  expectedText: string;
  /** Titre du modal */
  title: string;
  /** Message d'explication */
  message?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  deleting?: boolean;
}

export function DeleteConfirmationModal({
  expectedText,
  title,
  message,
  onConfirm,
  onClose,
  deleting = false,
}: DeleteConfirmationModalProps) {
  const [inputValue, setInputValue] = useState("");
  const isMatch = inputValue.trim() === expectedText;

  useEffect(() => {
    setInputValue("");
  }, [expectedText]);

  const handleConfirm = async () => {
    if (!isMatch || deleting) return;
    try {
      await onConfirm();
      onClose();
    } catch {
      // Laisser le modal ouvert en cas d'erreur pour que l'utilisateur puisse réessayer
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="subsection-header mb-2 text-lg font-medium text-[var(--foreground)]">{title}</h3>
        {message && (
          <p className="mb-4 text-sm text-[var(--muted-foreground)]">{message}</p>
        )}
        <p className="mb-2 text-sm font-medium text-[var(--foreground)]">
          Pour confirmer, tapez exactement : <strong className="text-[var(--destructive)]">{expectedText}</strong>
        </p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={expectedText}
          className="mb-6 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
          autoFocus
          aria-label="Confirmer la suppression"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isMatch || deleting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
