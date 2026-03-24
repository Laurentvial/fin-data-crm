-- Junction: one invoice can cover multiple transactions; each transaction at most one invoice.
CREATE TABLE IF NOT EXISTS invoice_transactions (
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, transaction_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_transactions_transaction_id
  ON invoice_transactions (transaction_id);

CREATE INDEX IF NOT EXISTS ix_invoice_transactions_invoice_id
  ON invoice_transactions (invoice_id);

-- Backfill from legacy single-transaction link on invoices
INSERT INTO invoice_transactions (invoice_id, transaction_id)
SELECT i.id, i.transaction_id
FROM invoices i
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_transactions it
  WHERE it.invoice_id = i.id AND it.transaction_id = i.transaction_id
);
