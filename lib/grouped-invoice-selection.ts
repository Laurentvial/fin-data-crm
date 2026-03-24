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
