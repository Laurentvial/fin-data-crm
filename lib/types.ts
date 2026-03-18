export type TransactionType = "DEBIT" | "CREDIT";

export interface Company {
  id: string;
  name: string;
  address?: string | null;
  siret?: string | null;
  directeur?: string | null;
  website?: string | null;
  has_logo?: boolean;
  bank_ids?: string[];
  emails?: string[];
  phones?: string[];
  country_code?: string;
  vat_number?: string | null;
  vat_rate?: number;
  invoice_prefix?: string;
  invoice_next_number?: number;
  invoice_template_id?: string | null;
  currency?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  amount: number;
}

export interface InvoiceLineItemInput {
  description: string;
  quantity: number;
  unit_price_ttc: number;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  address?: string | null;
  vat_number?: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  company_id: string;
  transaction_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  customer_name: string;
  customer_address?: string | null;
  customer_vat?: string | null;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: string;
  pdf_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceTemplate {
  id: string;
  company_id: string | null;
  name: string;
  country_code: string;
  template_content: string;
  is_default: boolean;
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

export interface AccountType {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface IbanItem {
  iban: string;
  bic?: string | null;
}

export type AccountStatus = "Ouvert" | "Fermé" | "Problème";

export interface BankAccount {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  telegram_chat_id: number;
  bank_id?: string | null;
  bank_name?: string | null;
  account_type_id?: string | null;
  account_type_name?: string | null;
  account_status?: AccountStatus;
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
  company_id?: string;
  company_name?: string;
  transaction_date: string;
  amount: string;
  description: string;
  type: TransactionType;
  raw_image_path: string | null;
  extracted_data_json: unknown;
  created_at: string;
  processed_by_user_id: string | null;
  /** Present when an invoice exists for this transaction (from GET /api/transactions) */
  invoice_id?: string | null;
  invoice_pdf_url?: string | null;
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
  file_type: "logo" | "kbis" | "statut" | "pi_gerant";
  filename: string | null;
  content_type: string | null;
  created_at: string;
}
