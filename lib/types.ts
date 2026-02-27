export type TransactionType = "DEBIT" | "CREDIT";

export interface Company {
  id: string;
  name: string;
  address?: string | null;
  siret?: string | null;
  directeur?: string | null;
  has_logo?: boolean;
  bank_ids?: string[];
  emails?: string[];
  phones?: string[];
  created_at: string;
  updated_at: string;
}

export interface Bank {
  id: string;
  name: string;
  has_logo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface IbanItem {
  iban: string;
  bic?: string | null;
}

export interface BankAccount {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  telegram_chat_id: number;
  bank_id?: string | null;
  bank_name?: string | null;
  has_logo?: boolean;
  ibans?: IbanItem[];
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

export interface CompanyEmail {
  id: string;
  company_id: string;
  email: string;
  password?: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyPhone {
  id: string;
  company_id: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyFile {
  id: string;
  company_id: string;
  file_type: "logo" | "kbis";
  filename: string | null;
  content_type: string | null;
  created_at: string;
}
