export type TransactionType = "DEBIT" | "CREDIT";

export interface Company {
  id: string;
  name: string;
  telegram_chat_id: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  company_id: string;
  company_name?: string;
  transaction_date: string;
  amount: string;
  description: string;
  type: TransactionType;
  raw_image_path: string | null;
  extracted_data_json: unknown;
  created_at: string;
  processed_by_user_id: number | null;
}

export interface TransactionUpdateBody {
  transaction_date?: string;
  amount?: number | string;
  description?: string;
  type?: TransactionType;
}
