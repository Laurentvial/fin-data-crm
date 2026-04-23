-- Appariement crédit interne : candidats / validation sans contrainte de société
-- (montant identique, dates à ±7 j, comptes bancaires différents uniquement).
-- À exécuter si la migration 043 a déjà été appliquée avec l’ancienne fonction.

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
