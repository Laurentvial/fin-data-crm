-- Crédit interne (virement inter-comptes) + lien vers le débit miroir
-- Enum : valeur alignée sur DEBIT / CREDIT (identifiants en majuscules côté app)
-- Sections séparées pour scripts/run-migration-043.js (Neon : une requête par appel).

-- @section enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'transactiontype'
      AND e.enumlabel = 'INTERNAL_CREDIT'
  ) THEN
    ALTER TYPE transactiontype ADD VALUE 'INTERNAL_CREDIT';
  END IF;
END
$$;

-- @section column
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS internal_transfer_debit_id uuid NULL
  REFERENCES transactions (id) ON DELETE SET NULL;

-- @section index
CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_internal_transfer_debit_unique
  ON transactions (internal_transfer_debit_id)
  WHERE internal_transfer_debit_id IS NOT NULL;

-- @section function
-- Mise à jour atomique crédit interne + fournisseur sur le débit lié (appelée depuis l’API)
CREATE OR REPLACE FUNCTION apply_internal_credit_pair(
  p_credit_id uuid,
  p_debit_id uuid,
  p_fournisseur_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  c_type transactiontype;
  c_ba text;
  c_amt numeric;
  c_date date;
  d_type transactiontype;
  d_ba text;
  d_amt numeric;
  d_date date;
  days_diff int;
BEGIN
  IF p_credit_id = p_debit_id THEN
    RAISE EXCEPTION 'invalid_pair_same_id';
  END IF;

  SELECT t.type, t.bank_account_id::text, t.amount::numeric, t.transaction_date
  INTO c_type, c_ba, c_amt, c_date
  FROM transactions t
  JOIN bank_accounts ba ON ba.id::text = t.bank_account_id::text
  WHERE t.id = p_credit_id
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_not_found';
  END IF;

  IF c_type IS DISTINCT FROM 'CREDIT'::transactiontype THEN
    RAISE EXCEPTION 'credit_must_be_credit_type';
  END IF;

  SELECT t.type, t.bank_account_id::text, t.amount::numeric, t.transaction_date
  INTO d_type, d_ba, d_amt, d_date
  FROM transactions t
  JOIN bank_accounts ba ON ba.id::text = t.bank_account_id::text
  WHERE t.id = p_debit_id
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit_not_found';
  END IF;

  IF d_type IS DISTINCT FROM 'DEBIT'::transactiontype THEN
    RAISE EXCEPTION 'counterpart_must_be_debit';
  END IF;

  IF c_ba = d_ba THEN
    RAISE EXCEPTION 'same_bank_account';
  END IF;

  IF c_amt IS DISTINCT FROM d_amt THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  days_diff := ABS((c_date - d_date));
  IF days_diff > 7 THEN
    RAISE EXCEPTION 'date_out_of_range';
  END IF;

  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE internal_transfer_debit_id = p_debit_id
      AND id IS DISTINCT FROM p_credit_id
  ) THEN
    RAISE EXCEPTION 'debit_already_paired';
  END IF;

  IF p_fournisseur_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM fournisseurs WHERE id = p_fournisseur_id) THEN
      RAISE EXCEPTION 'fournisseur_not_found';
    END IF;
  END IF;

  UPDATE transactions
  SET fournisseur_id = p_fournisseur_id
  WHERE id = p_debit_id;

  UPDATE transactions
  SET
    type = 'INTERNAL_CREDIT'::transactiontype,
    internal_transfer_debit_id = p_debit_id,
    fournisseur_id = p_fournisseur_id,
    debit_status = NULL
  WHERE id = p_credit_id;
END;
$$;
