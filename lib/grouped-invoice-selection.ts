import type { TransactionSelectionStats } from "@/components/TransactionsGrid";
import type { Transaction } from "@/lib/types";

/** Retourne un message si la facture groupée n’est pas autorisée, sinon `null`. */
export function groupedInvoiceDisabledReason(
  selectionStats: TransactionSelectionStats,
  selectedTransactions: Transaction[]
): string | null {
  const idCount = selectionStats.selectedTransactionIds.length;
  if (idCount < 2) return null;
  if (selectedTransactions.length !== idCount) {
    return "Certaines lignes ne sont pas visibles dans le tableau filtré.";
  }
  if (selectedTransactions.some((t) => t.invoice_id ?? t.invoice_pdf_url)) {
    return "Certaines transactions ont déjà une facture.";
  }
  const companyIds = new Set(selectedTransactions.map((t) => t.company_id).filter(Boolean));
  if (companyIds.size > 1) {
    return "Les transactions doivent être de la même société.";
  }
  return null;
}

/** Retourne un message si la création de facture (1 ligne cochée) n’est pas autorisée, sinon `null`. */
export function singleInvoiceDisabledReason(
  selectionStats: TransactionSelectionStats,
  selectedTransactions: Transaction[]
): string | null {
  if (selectionStats.selectedTransactionIds.length !== 1) return null;
  if (selectedTransactions.length !== 1) {
    return "La ligne cochée n'est pas visible dans le tableau filtré.";
  }
  const t = selectedTransactions[0]!;
  if (t.invoice_id ?? t.invoice_pdf_url) {
    return "Cette transaction a déjà une facture.";
  }
  return null;
}
