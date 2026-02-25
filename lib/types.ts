export type TransactionType = "DEBIT" | "CREDIT";

export interface Company {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  telegram_chat_id: number;
  balance?: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  bank_account_id: string;
  bank_account_name?: string;
  company_name?: string;
  transaction_date: string;
  amount: string;
  description: string;
  type: TransactionType;
  raw_image_path: string | null;
  extracted_data_json: unknown;
  created_at: string;
  processed_by_user_id: string | null;
}

export interface TransactionUpdateBody {
  transaction_date?: string;
  amount?: number | string;
  description?: string;
  type?: TransactionType;
}
