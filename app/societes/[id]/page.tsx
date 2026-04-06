"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AccountVignette } from "@/components/AccountVignette";
import { CreateBankAccountModal } from "@/components/CreateBankAccountModal";
import { DeleteConfirmationModal } from "@/components/DeleteConfirmationModal";
import { Select } from "@/components/Select";
import {
  FR_MOBILE_OPERATORS,
  needsLegacyOperateurOption,
  operateurToSelectValue,
} from "@/lib/french-mobile-operators";
import { modalBackdropClose } from "@/lib/modal-backdrop-close";
import { COUNTRY_LABELS_FR } from "@/lib/countries-fr";
import type {
  AccountStatus,
  AccountType,
  Bank,
  CardItem,
  Company,
  CompanyEmail,
  CompanyPhone,
  BankAccount,
  Transaction,
  IbanItem,
} from "@/lib/types";

function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function StarIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function SocieteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [emails, setEmails] = useState<CompanyEmail[]>([]);
  const [phones, setPhones] = useState<CompanyPhone[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactionsByAccount, setTransactionsByAccount] = useState<
    Record<string, Transaction[]>
  >({});
  const [hasLogo, setHasLogo] = useState(false);
  const [documents, setDocuments] = useState<Array<{ file_type: string; filename: string | null }>>([]);
  const [addDocModalOpen, setAddDocModalOpen] = useState(false);
  const [addDocType, setAddDocType] = useState<string>("kbis");
  const [addDocCustomName, setAddDocCustomName] = useState("");
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneOperateur, setNewPhoneOperateur] = useState("");
  const [addingPhone, setAddingPhone] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<AccountStatus[]>([]);
  const [createAccountModalOpen, setCreateAccountModalOpen] = useState(false);
  const [createAccountName, setCreateAccountName] = useState("");
  const [createAccountBankId, setCreateAccountBankId] = useState("");
  const [createAccountTypeId, setCreateAccountTypeId] = useState("");
  const [createAccountStatusId, setCreateAccountStatusId] = useState("");
  const [createAccountIbans, setCreateAccountIbans] = useState<IbanItem[]>([]);
  const [createAccountLogin, setCreateAccountLogin] = useState("");
  const [createAccountPassword, setCreateAccountPassword] = useState("");
  const [createAccountPinCode, setCreateAccountPinCode] = useState("");
  const [createAccountPlafondLimit, setCreateAccountPlafondLimit] = useState("");
  const [createAccountCards, setCreateAccountCards] = useState<CardItem[]>([]);
  const [createAccountLinkTelegramEnabled, setCreateAccountLinkTelegramEnabled] = useState(true);
  const [createAccountLinkExistingGroupId, setCreateAccountLinkExistingGroupId] = useState("");
  const [addingBankAccount, setAddingBankAccount] = useState(false);
  const [bankAccountError, setBankAccountError] = useState<string | null>(null);
  const [bankAccountInviteWarning, setBankAccountInviteWarning] = useState<string | null>(null);
  const [deletingBankAccountId, setDeletingBankAccountId] = useState<string | null>(null);
  const [bankAccountToDelete, setBankAccountToDelete] = useState<BankAccount | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingDocType, setDeletingDocType] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; country_code: string; is_default: boolean }>>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id || typeof id !== "string" || !id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [resCompany, resEmails, resPhones, resBank, resBanks, resAccountTypes, resAccountStatuses, resLogo, resDocs, resTemplates] = await Promise.all([
        fetch(`/api/accounts/${id}`, { credentials: "same-origin" }),
        fetch(`/api/accounts/${id}/emails`),
        fetch(`/api/accounts/${id}/phones`),
        fetch(`/api/accounts/${id}/bank-accounts`),
        fetch("/api/banks"),
        fetch("/api/account-types"),
        fetch("/api/account-statuses"),
        fetch(`/api/accounts/${id}/files/logo`).then((r) => (r.ok ? r : null)),
        fetch(`/api/accounts/${id}/files`),
        fetch("/api/templates"),
      ]);

      if (!resCompany.ok) {
        const errData = await resCompany.json().catch(() => ({}));
        const msg = typeof errData?.error === "string" ? errData.error : "Société introuvable.";
        throw new Error(msg);
      }
      const companyData = await resCompany.json();
      setCompany(companyData);

      if (resEmails.ok) {
        const emailsData = await resEmails.json();
        const sorted = (Array.isArray(emailsData) ? emailsData : []).sort(
          (a: CompanyEmail, b: CompanyEmail) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.email.localeCompare(b.email)
        );
        setEmails(sorted);
      }

      if (resPhones.ok) {
        const phonesData = await resPhones.json();
        const sorted = (Array.isArray(phonesData) ? phonesData : []).sort(
          (a: CompanyPhone, b: CompanyPhone) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.phone.localeCompare(b.phone)
        );
        setPhones(sorted);
      }

      if (resBank.ok) {
        const bankData = await resBank.json();
        const bankList = Array.isArray(bankData) ? bankData : [];
        setBankAccounts(bankList);

        const txMap: Record<string, Transaction[]> = {};
        await Promise.all(
          bankList.map(async (ba: BankAccount) => {
            const resTx = await fetch(
              `/api/transactions?bank_account_id=${ba.id}&limit=5`
            );
            if (resTx.ok) {
              const txData = await resTx.json();
              txMap[ba.id] = Array.isArray(txData) ? txData : (txData.transactions ?? []);
            } else {
              txMap[ba.id] = [];
            }
          })
        );
        setTransactionsByAccount(txMap);
      }

      if (resBanks.ok) {
        const banksData = await resBanks.json();
        setBanks(Array.isArray(banksData) ? banksData : []);
      }

      if (resAccountTypes?.ok) {
        const accountTypesData = await resAccountTypes.json();
        setAccountTypes(Array.isArray(accountTypesData) ? accountTypesData : []);
      }

      if (resAccountStatuses?.ok) {
        const accountStatusesData = await resAccountStatuses.json();
        setAccountStatuses(Array.isArray(accountStatusesData) ? accountStatusesData : []);
      }

      setHasLogo(resLogo?.ok ?? false);
      if (resDocs?.ok) {
        const docsData = await resDocs.json();
        setDocuments(Array.isArray(docsData) ? docsData : []);
      } else {
        setDocuments([]);
      }

      if (resTemplates?.ok) {
        const templatesData = await resTemplates.json();
        setTemplates(
          (Array.isArray(templatesData) ? templatesData : []).map((t: { id: string; name: string; country_code: string; is_default: boolean }) => ({
            id: t.id,
            name: t.name,
            country_code: t.country_code,
            is_default: t.is_default,
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddEmail = async () => {
    const email = newEmail.trim();
    const password = newPassword;
    if (!email) return;
    setAddingEmail(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'ajout");
      }
      const added = await res.json();
      setEmails((prev) => [...prev, added].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.email.localeCompare(b.email)));
      setNewEmail("");
      setNewPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setAddingEmail(false);
    }
  };

  const handleAddPhone = async () => {
    const phone = newPhone.trim();
    if (!phone) return;
    setAddingPhone(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          operateur: newPhoneOperateur.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'ajout");
      }
      const added = await res.json();
      setPhones((prev) => [...prev, added].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.phone.localeCompare(b.phone)));
      setNewPhone("");
      setNewPhoneOperateur("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setAddingPhone(false);
    }
  };

  const handleSetDefaultEmail = async (emailId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/emails/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error("Échec de la mise à jour");
      const updated = await res.json();
      setEmails((prev) =>
        prev
          .map((e) => (e.id === emailId ? { ...e, is_default: true } : { ...e, is_default: false }))
          .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.email.localeCompare(b.email))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  };

  const handleSetDefaultPhone = async (phoneId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/phones/${phoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error("Échec de la mise à jour");
      const updated = (await res.json()) as CompanyPhone;
      setPhones((prev) =>
        prev
          .map((p) => (p.id === phoneId ? updated : { ...p, is_default: false }))
          .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.phone.localeCompare(b.phone))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  };

  const handlePhoneOperateurSelect = async (
    phoneId: string,
    current: string | null | undefined,
    next: string
  ) => {
    const nextVal = next.trim() || null;
    const prevVal = (current ?? "").trim() || null;
    if (nextVal === prevVal) return;
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/phones/${phoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operateur: nextVal }),
      });
      if (!res.ok) throw new Error("Échec de la mise à jour");
      const updated = (await res.json()) as CompanyPhone;
      setPhones((prevPhones) => prevPhones.map((p) => (p.id === phoneId ? updated : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  };

  const handleDeletePhone = async (phoneId: string) => {
    if (!confirm("Supprimer ce numéro ?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/phones/${phoneId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    if (!confirm("Supprimer cet email ?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/emails/${emailId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      setRevealedPasswords((p) => {
        const next = { ...p };
        delete next[emailId];
        return next;
      });
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  };

  const handleTemplateChange = async (templateId: string | null) => {
    if (!company) return;
    setSavingTemplate(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: company.name,
          address: company.address ?? null,
          siret: company.siret ?? null,
          directeur: company.directeur ?? null,
          invoice_template_id: templateId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec");
      }
      const updated = await res.json();
      setCompany((prev) => (prev ? { ...prev, invoice_template_id: updated.invoice_template_id } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleRevealPassword = async (emailId: string) => {
    if (revealedPasswords[emailId]) {
      setRevealedPasswords((p) => {
        const next = { ...p };
        delete next[emailId];
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/accounts/${id}/emails/${emailId}?password=1`);
      if (!res.ok) throw new Error("Échec");
      const data = await res.json();
      setRevealedPasswords((p) => ({ ...p, [emailId]: data.password ?? "" }));
    } catch {
      setRevealedPasswords((p) => ({ ...p, [emailId]: "—" }));
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "logo");
      const res = await fetch(`/api/accounts/${id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'upload");
      }
      setHasLogo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm("Supprimer le logo ?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/files/logo`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data?.error === "string" ? data.error : "Échec de la suppression";
        throw new Error(msg);
      }
      setHasLogo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  };

  const DOC_TYPE_LABELS: Record<string, string> = {
    kbis: "Kbis",
    statut: "Statut de la société",
    pi_gerant: "Pièce d'identité du gérant",
    pi_recto: "Pièce d'identité recto",
    pi_verso: "Pièce d'identité verso",
    selfie: "Selfie",
  };

  function getDocLabel(fileType: string): string {
    if (DOC_TYPE_LABELS[fileType]) return DOC_TYPE_LABELS[fileType];
    if (fileType.startsWith("autre_")) {
      const slug = fileType.slice(6);
      return slug
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
    return fileType;
  }

  const handleUploadDoc = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocType(type);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      const res = await fetch(`/api/accounts/${id}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de l'upload");
      }
      const row = await res.json();
      setDocuments((prev) => {
        const filtered = prev.filter((d) => d.file_type !== type);
        return [...filtered, { file_type: row.file_type, filename: row.filename }];
      });
      setAddDocModalOpen(false);
      setAddDocType("kbis");
      setAddDocCustomName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setUploadingDocType(null);
      e.target.value = "";
    }
  };

  const handleAddDocSubmit = (file: File) => {
    let type = addDocType;
    if (type === "autre") {
      const slug = addDocCustomName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      if (!slug) return;
      type = `autre_${slug}`;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    setUploadingDocType(type);
    setError(null);
    fetch(`/api/accounts/${id}/files`, {
      method: "POST",
      body: formData,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Échec de l'upload");
        }
        return res.json();
      })
      .then((row) => {
        setDocuments((prev) => {
          const filtered = prev.filter((d) => d.file_type !== type);
          return [...filtered, { file_type: row.file_type, filename: row.filename }];
        });
        setAddDocModalOpen(false);
        setAddDocType("kbis");
        setAddDocCustomName("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur inconnue"))
      .finally(() => {
        setUploadingDocType(null);
      });
  };

  const handleDeleteDoc = async (fileType: string) => {
    if (!confirm(`Supprimer le document « ${getDocLabel(fileType)} » ?`)) return;
    setDeletingDocType(fileType);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${id}/files/${encodeURIComponent(fileType)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data?.error === "string" ? data.error : "Échec de la suppression";
        throw new Error(msg);
      }
      setDocuments((prev) => prev.filter((d) => d.file_type !== fileType));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setDeletingDocType(null);
    }
  };

  const openCreateAccountModal = () => {
    setCreateAccountModalOpen(true);
    setCreateAccountName("");
    setCreateAccountBankId("");
    setCreateAccountTypeId("");
    const sortedStatuses = [...accountStatuses].sort((a, b) => a.sort_order - b.sort_order);
    setCreateAccountStatusId(sortedStatuses[3]?.id ?? "");
    setCreateAccountIbans([]);
    setCreateAccountLogin("");
    setCreateAccountPassword("");
    setCreateAccountPinCode("");
    setCreateAccountPlafondLimit("");
    setCreateAccountCards([]);
    setCreateAccountLinkTelegramEnabled(true);
    setCreateAccountLinkExistingGroupId("");
    setBankAccountError(null);
    setBankAccountInviteWarning(null);
  };

  const createAccountLastAutoNameRef = useRef<string | null>(null);

  const closeCreateAccountModal = () => {
    setCreateAccountModalOpen(false);
    setBankAccountError(null);
    setBankAccountInviteWarning(null);
    createAccountLastAutoNameRef.current = null;
  };

  useEffect(() => {
    if (!createAccountModalOpen || !company) return;
    const typeId = (createAccountTypeId ?? "").toString().trim().toLowerCase();
    const statusId = (createAccountStatusId ?? "").toString().trim().toLowerCase();
    const client = typeId ? accountTypes.find((t) => String(t?.id ?? "").trim().toLowerCase() === typeId) : undefined;
    const status = statusId ? accountStatuses.find((s) => String(s?.id ?? "").trim().toLowerCase() === statusId) : undefined;
    const clientEmoji = (client?.emoji ?? "").toString().trim().replace(/\s/g, "");
    const statusEmoji = (status?.emoji ?? "").toString().trim().replace(/\s/g, "");
    const clientPart = clientEmoji;
    const statusPart = statusEmoji;
    const prefix = [clientPart, statusPart].filter(Boolean).join(" ");
    const firstIban = createAccountIbans.find((i) => (i?.iban ?? "").trim().length > 0);
    const rawIban = (firstIban?.iban ?? "").trim().replace(/\s/g, "").toUpperCase();
    const iban2 = rawIban.slice(0, 2);
    const bank = banks.find((b) => b.id === createAccountBankId);
    const bankName = (bank?.name ?? "").trim();
    const companyName = (company?.name ?? "").trim();
    const midPart = iban2 && bankName ? `${iban2}_${bankName}` : iban2 || bankName || "";
    const textPart = [midPart, companyName].filter(Boolean).join(" / ").toUpperCase();
    const autoName = textPart ? (prefix ? prefix + " " : "") + textPart : prefix || "";
    if (!autoName) return;
    const nameTrimmed = createAccountName.trim();
    const canUpdate = !nameTrimmed || nameTrimmed === createAccountLastAutoNameRef.current;
    if (!canUpdate) return;
    if (nameTrimmed === autoName) return;
    createAccountLastAutoNameRef.current = autoName;
    setCreateAccountName(autoName);
  }, [createAccountModalOpen, company, createAccountTypeId, createAccountStatusId, createAccountBankId, createAccountIbans, createAccountName, accountTypes, accountStatuses, banks]);

  const handleDeleteBankAccount = async (ba: BankAccount) => {
    setDeletingBankAccountId(ba.id);
    setError(null);
    try {
      const res = await fetch(`/api/bank-accounts/${ba.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la suppression");
      }
      setBankAccounts((prev) => prev.filter((b) => b.id !== ba.id));
      setTransactionsByAccount((prev) => {
        const next = { ...prev };
        delete next[ba.id];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      throw e;
    } finally {
      setDeletingBankAccountId(null);
    }
  };

  const handleAddBankAccount = async () => {
    const name = createAccountName.trim();
    if (!name) return;
    if (createAccountLinkTelegramEnabled) {
      const linkId = createAccountLinkExistingGroupId.trim();
      if (!linkId || !/^-?\d+$/.test(linkId)) {
        setBankAccountError(
          "Indiquez un ID de groupe Telegram valide (nombre, ex. -100…), ou décochez « Lier un groupe Telegram existant » pour créer le compte uniquement dans le CRM."
        );
        return;
      }
    }
    setAddingBankAccount(true);
    setBankAccountError(null);
    try {
      const ibansToSend = createAccountIbans
        .map((v) => ({
          iban: v.iban.trim().replace(/\s/g, "").toUpperCase(),
          bic: (v.bic ?? "").trim().replace(/\s/g, "").toUpperCase() || undefined,
        }))
        .filter((v) => v.iban.length > 0);
      const cardsToSend = createAccountCards
        .map((v) => ({
          numero: v.numero.trim().replace(/\s/g, ""),
          date_expiration: (v.date_expiration ?? "").trim() || undefined,
          cvv: (v.cvv ?? "").trim() || undefined,
        }))
        .filter((v) => v.numero.length > 0);
      const body: {
        name: string;
        company_id: string;
        bank_id?: string;
        account_type_id?: string;
        account_status_id?: string;
        ibans: IbanItem[];
        login?: string;
        password?: string;
        pin_code?: string;
        plafond_limit?: string;
        cards?: CardItem[];
        telegram_chat_id?: string;
        skip_telegram?: boolean;
      } = {
        name,
        company_id: id,
        ibans: ibansToSend,
      };
      if (createAccountBankId) body.bank_id = createAccountBankId;
      if (createAccountTypeId) body.account_type_id = createAccountTypeId;
      if (createAccountStatusId) body.account_status_id = createAccountStatusId;
      if (createAccountLogin.trim()) body.login = createAccountLogin.trim();
      if (createAccountPassword.trim()) body.password = createAccountPassword.trim();
      if (createAccountPinCode.trim()) body.pin_code = createAccountPinCode.trim();
      if (createAccountPlafondLimit.trim()) body.plafond_limit = createAccountPlafondLimit.trim();
      if (cardsToSend.length > 0) body.cards = cardsToSend;
      if (createAccountLinkTelegramEnabled) {
        body.telegram_chat_id = createAccountLinkExistingGroupId.trim();
      } else {
        body.skip_telegram = true;
      }
      const res = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const rawText = await res.text();
      let parsed: unknown = {};
      try {
        parsed = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Réponse serveur invalide (non-JSON)."
            : `Erreur ${res.status} — réponse non-JSON (proxy ou timeout).`
        );
      }
      if (!res.ok) {
        const errBody = parsed as { error?: string };
        throw new Error(errBody.error ?? "Échec de l'ajout");
      }
      const added = parsed as BankAccount & {
        telegram_setup_warning?: string;
        telegram_invite_warnings?: { telegram_id: number; name?: string; telegram_username?: string; reason: string }[];
      };
      setBankAccounts((prev) => [...prev, added as BankAccount].sort((a, b) => a.name.localeCompare(b.name)));
      const setupWarning =
        typeof added.telegram_setup_warning === "string"
          ? added.telegram_setup_warning.trim()
          : "";
      const warnings = added.telegram_invite_warnings;
      const inviteParts: string[] = [];
      if (setupWarning) inviteParts.push(setupWarning);
      if (Array.isArray(warnings) && warnings.length > 0) {
        const names = warnings.map((w) => w.name || (w.telegram_username ? `@${w.telegram_username}` : `ID ${w.telegram_id}`));
        const reasonMsg = warnings.some((w) => w.reason === "UserNotMutualContactError")
          ? "Ils doivent être dans les contacts du compte Telegram admin."
          : warnings.some((w) => w.reason === "UserPrivacyRestrictedError")
            ? "Paramètres de confidentialité Telegram : la personne doit aller dans Paramètres → Confidentialité → Groupes et canaux → « Qui peut vous ajouter aux groupes » et choisir « Tout le monde » ou « Mes contacts »."
            : warnings.some((w) => String(w.reason).includes("FloodWaitError"))
              ? "Telegram limite temporairement les invitations (anti-spam). Le délai peut être très long ; attendez ou ajoutez les membres à la main dans le groupe. Le service espère désormais les invitations par petits lots avec des pauses plus longues."
              : warnings.some((w) => String(w.reason).includes("PeerFloodError"))
                ? "Trop d'invitations trop rapides pour ce groupe (limite Telegram). Réessayez plus tard, augmentez les pauses côté service (TELEGRAM_DELAY_CLASSIC_CHAT_INVITE_SEC, TELEGRAM_PEER_FLOOD_RETRY_SEC) ou ajoutez les membres à la main."
                : warnings.length > 0
                ? `Raison technique : ${warnings.map((w) => w.reason).filter(Boolean).join(", ")}`
                : null;
        inviteParts.push(
          `${warnings.length} utilisateur(s) n'ont pas pu être ajoutés : ${names.join(", ")}. ${reasonMsg ?? ""}`
        );
      }
      if (inviteParts.length > 0) {
        setBankAccountInviteWarning(inviteParts.join("\n\n"));
      } else {
        closeCreateAccountModal();
      }
    } catch (e) {
      setBankAccountError(e instanceof Error ? e.message : "Erreur inconnue");
      setBankAccountInviteWarning(null);
    } finally {
      setAddingBankAccount(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <p className="text-[var(--muted-foreground)]">Chargement…</p>
        </main>
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 overflow-auto p-6">
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
          <Link
            href="/societes"
            className="inline-flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
          >
            <ChevronLeftIcon />
            Retour aux sociétés
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-auto p-6">
        <Link
          href="/societes"
          className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeftIcon />
          Retour aux sociétés
        </Link>

        <h1 className="page-title mb-6 text-2xl font-semibold">
          {company?.name ?? "Société"}
        </h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
            <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <h2 className="section-header mb-2 text-base font-medium">Logo</h2>
              {hasLogo ? (
                <div className="group relative w-full min-h-[80px] rounded-lg py-2">
                  <div className="h-[64px] w-full overflow-hidden rounded-lg bg-[var(--muted)]">
                    <img
                      src={`/api/accounts/${id}/files/logo?t=${Date.now()}`}
                      alt="Logo"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-2 rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <label className="cursor-pointer rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)]">
                      {uploadingLogo ? "Upload…" : "Remplacer"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingLogo}
                        onChange={handleUploadLogo}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={(e) => {
                        e.preventDefault();
                        void handleDeleteLogo();
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <label className="group flex min-h-[80px] w-full cursor-pointer flex-col items-start gap-2 rounded-lg py-2">
                  <UploadIcon className="text-[var(--muted-foreground)]" />
                  <span className="text-sm text-[var(--muted-foreground)]">
                    {uploadingLogo ? "Upload…" : "Choisir un fichier"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={handleUploadLogo}
                  />
                </label>
              )}
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="section-header mb-4 text-lg font-medium">Documents</h2>
              <div className="grid grid-cols-1 gap-2">
                {documents.map((doc) => (
                  <label
                    key={doc.file_type}
                    className="group relative flex cursor-pointer flex-col items-center justify-center gap-0 rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 min-h-[44px] w-full"
                  >
                    <p className="text-xs font-medium text-[var(--muted-foreground)]">{getDocLabel(doc.file_type)}</p>
                    <div className="absolute inset-0 flex flex-row flex-wrap items-center justify-center gap-2 rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <a
                            href={`/api/accounts/${id}/files/${encodeURIComponent(doc.file_type)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
                          >
                            Voir
                          </a>
                          <span className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)]">
                            {uploadingDocType === doc.file_type ? "Upload…" : "Remplacer"}
                          </span>
                          <button
                            type="button"
                            disabled={!!uploadingDocType || !!deletingDocType}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              void handleDeleteDoc(doc.file_type);
                            }}
                            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                          >
                            {deletingDocType === doc.file_type ? "…" : "Supprimer"}
                          </button>
                    </div>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      disabled={!!uploadingDocType || !!deletingDocType}
                      onChange={(e) => handleUploadDoc(e, doc.file_type)}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddDocModalOpen(true);
                  setAddDocType("kbis");
                  setAddDocCustomName("");
                  setError(null);
                }}
                className="mt-4 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
              >
                Ajouter un document
              </button>
            </section>
            </div>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="grid gap-6 lg:grid-cols-4">
                <div>
                  <h2 className="section-header mb-4 text-lg font-medium">Informations générales</h2>
                  <dl className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Nom</dt>
                      <dd className="text-base">{company?.name ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">VPS</dt>
                      <dd className="text-base">{company?.vps ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Forme juridique</dt>
                      <dd className="text-base">{company?.forme_juridique ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Capital social</dt>
                      <dd className="text-base">{company?.capital_social ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Adresse</dt>
                      <dd className="text-base">{company?.address ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Code postal</dt>
                      <dd className="text-base">{company?.code_postal ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Ville</dt>
                      <dd className="text-base">{company?.ville ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Pays</dt>
                      <dd className="text-base">{company?.country_code ? (COUNTRY_LABELS_FR[company.country_code] ?? company.country_code) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Siret</dt>
                      <dd className="text-base">{company?.siret ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Activité</dt>
                      <dd className="text-base">{company?.activite ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Date d&apos;immatriculation</dt>
                      <dd className="text-base">{formatDateDisplay(company?.date_immatriculation)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Site web</dt>
                      <dd className="text-base">
                        {company?.website ? (
                          <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">
                            {company.website}
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h2 className="section-header mb-4 text-lg font-medium">Gérant</h2>
                  <dl className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Nom</dt>
                      <dd className="text-base">{company?.directeur ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Adresse personnelle</dt>
                      <dd className="text-base">{company?.gerant_adresse ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Code postal</dt>
                      <dd className="text-base">{company?.gerant_code_postal ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Ville</dt>
                      <dd className="text-base">{company?.gerant_ville ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Pays</dt>
                      <dd className="text-base">{company?.gerant_pays ? (COUNTRY_LABELS_FR[company.gerant_pays] ?? company.gerant_pays) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Date de naissance</dt>
                      <dd className="text-base">{formatDateDisplay(company?.gerant_date_naissance)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Ville de naissance</dt>
                      <dd className="text-base">{company?.gerant_ville_naissance ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Code postal de naissance</dt>
                      <dd className="text-base">{company?.gerant_code_postal_naissance ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Pays de naissance</dt>
                      <dd className="text-base">{company?.gerant_pays_naissance ? (COUNTRY_LABELS_FR[company.gerant_pays_naissance] ?? company.gerant_pays_naissance) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">N° fiscal</dt>
                      <dd className="text-base">{company?.gerant_numero_fiscal ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">N° sécurité sociale</dt>
                      <dd className="text-base">{company?.gerant_numero_secu ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">N° pièce d&apos;identité</dt>
                      <dd className="text-base">{company?.gerant_numero_piece_identite ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h2 className="section-header mb-4 text-lg font-medium">Facturation</h2>
                  <dl className="grid gap-5 sm:grid-cols-1">
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">N° TVA</dt>
                      <dd className="text-base">{company?.vat_number ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Taux TVA</dt>
                      <dd className="text-base">
                        {Array.isArray(company?.vat_rates) && company.vat_rates.length > 0
                          ? company.vat_rates.map((r) => `${r}%`).join(", ")
                          : company?.vat_rate != null
                            ? `${company.vat_rate}%`
                            : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Préfixe factures</dt>
                      <dd className="text-base">{company?.invoice_prefix ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Prochain numéro</dt>
                      <dd className="text-base">
                        {company?.invoice_next_number != null
                          ? `${company.invoice_prefix ?? "FAC-"}${new Date().getFullYear()}-${String(company.invoice_next_number).padStart(4, "0")}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Devise</dt>
                      <dd className="text-base">{company?.currency ?? "—"}</dd>
                    </div>
                    <div className="mt-4 pt-4 border-t border-[var(--border)]">
                      <dt className="text-sm font-medium uppercase text-[var(--muted-foreground)] mb-1">Source</dt>
                      <dd className="text-base">{company?.source_name ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h2 className="section-header mb-4 text-lg font-medium">Bloc-notes</h2>
                  <textarea
                    value={company?.bloc_notes ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCompany((prev) => (prev ? { ...prev, bloc_notes: v } : null));
                    }}
                    onBlur={async () => {
                      if (!company?.id) return;
                      try {
                        const res = await fetch(`/api/accounts/${company.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: company.name,
                            address: company.address ?? null,
                            siret: company.siret ?? null,
                            directeur: company.directeur ?? null,
                            website: company.website ?? null,
                            vps: company.vps ?? null,
                            forme_juridique: company.forme_juridique ?? null,
                            capital_social: company.capital_social ?? null,
                            code_postal: company.code_postal ?? null,
                            ville: company.ville ?? null,
                            activite: company.activite ?? null,
                            date_immatriculation: company.date_immatriculation ?? null,
                            country_code: company.country_code ?? null,
                            source_id: company.source_id ?? null,
                            gerant_adresse: company.gerant_adresse ?? null,
                            gerant_code_postal: company.gerant_code_postal ?? null,
                            gerant_ville: company.gerant_ville ?? null,
                            gerant_pays: company.gerant_pays ?? null,
                            gerant_date_naissance: company.gerant_date_naissance ?? null,
                            gerant_ville_naissance: company.gerant_ville_naissance ?? null,
                            gerant_code_postal_naissance: company.gerant_code_postal_naissance ?? null,
                            gerant_pays_naissance: company.gerant_pays_naissance ?? null,
                            gerant_numero_fiscal: company.gerant_numero_fiscal ?? null,
                            gerant_numero_secu: company.gerant_numero_secu ?? null,
                            gerant_numero_piece_identite: company.gerant_numero_piece_identite ?? null,
                            vat_number: company.vat_number ?? null,
                            vat_rate: company.vat_rate,
                            vat_rates: company.vat_rates,
                            invoice_prefix: company.invoice_prefix ?? null,
                            invoice_next_number: company.invoice_next_number,
                            currency: company.currency ?? null,
                            invoice_template_id: company.invoice_template_id ?? null,
                            bloc_notes: (company.bloc_notes ?? "").trim() || null,
                          }),
                        });
                        if (res.ok) return;
                        const data = await res.json();
                        setError(data.error ?? "Échec de l'enregistrement");
                      } catch {
                        setError("Échec de l'enregistrement");
                      }
                    }}
                    placeholder="Saisir des notes libres…"
                    rows={12}
                    className="block w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base min-h-[200px]"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-4">
                <Link
                  href={`/societes?edit=${id}`}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Modifier les informations
                </Link>
                <Link
                  href={`/societes/${id}/factures`}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  Voir les factures
                </Link>
              </div>
            </section>

          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="section-header mb-4 text-lg font-medium">Emails</h2>
              <form
                className="mb-4 flex flex-wrap gap-2"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAddEmail();
                }}
              >
                <input
                  type="email"
                  name="societe-smtp-email"
                  id={`societe-email-${id}`}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="off"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  name="societe-smtp-secret"
                  id={`societe-email-secret-${id}`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mot de passe"
                  autoComplete="new-password"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={addingEmail || !newEmail.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {addingEmail ? "Ajout…" : "Ajouter"}
                </button>
              </form>
              {emails.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Aucun email enregistré.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)] w-10">Défaut</th>
                        <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Email</th>
                        <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Mot de passe</th>
                        <th className="px-4 py-2 text-right font-medium text-[var(--muted-foreground)]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emails.map((em) => (
                        <tr key={em.id} className="border-t border-[var(--border)]">
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => handleSetDefaultEmail(em.id)}
                              className={`rounded p-1 ${em.is_default ? "text-amber-500" : "text-[var(--muted-foreground)] hover:text-amber-500"}`}
                              title={em.is_default ? "Email par défaut" : "Définir comme défaut"}
                            >
                              <StarIcon filled={!!em.is_default} />
                            </button>
                          </td>
                          <td className="px-4 py-2">{em.email}</td>
                          <td className="px-4 py-2 font-mono text-xs">
                            {revealedPasswords[em.id] !== undefined ? (
                              revealedPasswords[em.id]
                            ) : (
                              <span className="text-[var(--muted-foreground)]">••••••••</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRevealPassword(em.id)}
                              className="ml-2 text-[var(--primary)] hover:underline"
                            >
                              {revealedPasswords[em.id] !== undefined ? "Masquer" : "Afficher"}
                            </button>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteEmail(em.id)}
                              className="text-red-600 hover:underline dark:text-red-400"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="section-header mb-4 text-lg font-medium">Numéros de téléphone</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Numéro de téléphone"
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <Select
                  value={newPhoneOperateur}
                  onChange={(e) => setNewPhoneOperateur(e.target.value)}
                  className="min-w-[200px] max-w-[280px]"
                  aria-label="Opérateur mobile"
                >
                  <option value="">Opérateur</option>
                  {FR_MOBILE_OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={handleAddPhone}
                  disabled={addingPhone || !newPhone.trim()}
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {addingPhone ? "Ajout…" : "Ajouter"}
                </button>
              </div>
              {phones.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Aucun numéro enregistré.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)] w-10">Défaut</th>
                        <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Numéro</th>
                        <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)] min-w-[160px]">Opérateur</th>
                        <th className="px-4 py-2 text-right font-medium text-[var(--muted-foreground)]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phones.map((ph) => (
                        <tr key={ph.id} className="border-t border-[var(--border)]">
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => handleSetDefaultPhone(ph.id)}
                              className={`rounded p-1 ${ph.is_default ? "text-amber-500" : "text-[var(--muted-foreground)] hover:text-amber-500"}`}
                              title={ph.is_default ? "Numéro par défaut" : "Définir comme défaut"}
                            >
                              <StarIcon filled={!!ph.is_default} />
                            </button>
                          </td>
                          <td className="px-4 py-2">{ph.phone}</td>
                          <td className="px-4 py-2">
                            <Select
                              value={operateurToSelectValue(ph.operateur)}
                              onChange={(e) => {
                                void handlePhoneOperateurSelect(ph.id, ph.operateur, e.target.value);
                              }}
                              className="min-w-[200px] max-w-[280px]"
                              aria-label={`Opérateur pour ${ph.phone}`}
                            >
                              <option value="">—</option>
                              {FR_MOBILE_OPERATORS.map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                              {(() => {
                                const legacy = ph.operateur?.trim();
                                if (!legacy || !needsLegacyOperateurOption(ph.operateur)) return null;
                                return (
                                  <option value={legacy}>
                                    {legacy} (hors liste)
                                  </option>
                                );
                              })()}
                            </Select>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeletePhone(ph.id)}
                              className="text-red-600 hover:underline dark:text-red-400"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="section-header mb-4 text-lg font-medium">Template de facture</h2>
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              Choisissez le template à utiliser pour les factures de cette société. Les templates sont gérés dans les paramètres.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <select
                value={company?.invoice_template_id ?? ""}
                onChange={(e) => handleTemplateChange(e.target.value || null)}
                disabled={savingTemplate || templates.length === 0}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm min-w-[200px]"
              >
                <option value="">Template par défaut</option>
                {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.is_default ? " (par défaut)" : ""}
                    </option>
                  ))}
              </select>
              {savingTemplate && <span className="text-sm text-[var(--muted-foreground)]">Enregistrement…</span>}
            </div>
            {templates.length === 0 && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">Aucun template disponible. Créez-en un dans les paramètres.</p>
            )}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="section-header text-lg font-medium">Comptes bancaires</h2>
              <button
                type="button"
                onClick={openCreateAccountModal}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
              >
                Ajouter un compte bancaire
              </button>
            </div>
            {!createAccountModalOpen && bankAccountError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {bankAccountError}
              </div>
            )}
            {!createAccountModalOpen && bankAccountInviteWarning && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {bankAccountInviteWarning}
              </div>
            )}
            <p className="mb-4 text-xs text-[var(--muted-foreground)]">
              Un groupe Telegram sera créé automatiquement, ou cochez « Lier un groupe Telegram existant » pour utiliser un groupe déjà créé (ID ex. -5186500052).
            </p>
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Aucun compte bancaire lié.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {bankAccounts.map((ba) => (
                  <AccountVignette
                    key={ba.id}
                    bankAccount={ba}
                    transactions={transactionsByAccount[ba.id] ?? []}
                    hideCompanyName
                    onEdit={(ba) => router.push(`/accounts?edit=${ba.id}`)}
                    onDelete={(ba) => setBankAccountToDelete(ba)}
                    deleting={deletingBankAccountId === ba.id}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {bankAccountToDelete && (
        <DeleteConfirmationModal
          title="Supprimer le compte bancaire"
          expectedText={`supprimer ${bankAccountToDelete.name} - ${bankAccountToDelete.company_name ?? company?.name ?? ""}`}
          message="Cette action est irréversible."
          onConfirm={async () => {
            await handleDeleteBankAccount(bankAccountToDelete);
            setBankAccountToDelete(null);
          }}
          onClose={() => setBankAccountToDelete(null)}
          deleting={deletingBankAccountId === bankAccountToDelete.id}
        />
      )}

      {addDocModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (uploadingDocType) return;
            modalBackdropClose(e, () => setAddDocModalOpen(false));
          }}
        >
          <div
            className="flex w-full max-w-md flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="subsection-header mb-4 text-lg font-medium">Ajouter un document</h3>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Type</label>
              <Select
                value={addDocType}
                onChange={(e) => setAddDocType(e.target.value)}
              >
                <option value="kbis">Kbis</option>
                <option value="statut">Statut de la société</option>
                <option value="pi_recto">Pièce d&apos;identité recto</option>
                <option value="pi_verso">Pièce d&apos;identité verso</option>
                <option value="selfie">Selfie</option>
                <option value="autre">Autre</option>
              </Select>
            </div>
            {addDocType === "autre" && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Nom du document</label>
                <input
                  type="text"
                  value={addDocCustomName}
                  onChange={(e) => setAddDocCustomName(e.target.value)}
                  placeholder="Ex. Contrat de travail"
                  className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
            )}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Fichier</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                disabled={!!uploadingDocType}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (addDocType === "autre" && !addDocCustomName.trim()) {
                    setError("Veuillez saisir un nom pour le document.");
                    return;
                  }
                  handleAddDocSubmit(file);
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !uploadingDocType && setAddDocModalOpen(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {createAccountModalOpen && company && (
        <CreateBankAccountModal
          companies={[company]}
          banks={banks}
          accountTypes={accountTypes}
          accountStatuses={accountStatuses}
          name={createAccountName}
          companyId={id}
          bankId={createAccountBankId}
          accountTypeId={createAccountTypeId}
          accountStatusId={createAccountStatusId}
          ibans={createAccountIbans}
          login={createAccountLogin}
          password={createAccountPassword}
          pinCode={createAccountPinCode}
          plafondLimit={createAccountPlafondLimit}
          cards={createAccountCards}
          onNameChange={(v) => {
            setCreateAccountName(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onCompanyIdChange={() => {}}
          onLoginChange={(v) => {
            setCreateAccountLogin(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onPasswordChange={(v) => {
            setCreateAccountPassword(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onPinCodeChange={(v) => {
            setCreateAccountPinCode(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onPlafondLimitChange={(v) => {
            setCreateAccountPlafondLimit(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onCardsChange={(v) => {
            setCreateAccountCards(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onBankIdChange={(v) => {
            setCreateAccountBankId(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onAccountTypeIdChange={(v) => {
            setCreateAccountTypeId(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onAccountStatusIdChange={(v) => {
            setCreateAccountStatusId(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onIbansChange={(v) => {
            setCreateAccountIbans(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          linkTelegramEnabled={createAccountLinkTelegramEnabled}
          onLinkTelegramEnabledChange={(v) => {
            setCreateAccountLinkTelegramEnabled(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          linkExistingGroupId={createAccountLinkExistingGroupId}
          onLinkExistingGroupIdChange={(v) => {
            setCreateAccountLinkExistingGroupId(v);
            if (bankAccountError) setBankAccountError(null);
          }}
          onSubmit={handleAddBankAccount}
          onClose={closeCreateAccountModal}
          saving={addingBankAccount}
          error={bankAccountError}
          inviteWarning={bankAccountInviteWarning}
          fixedCompanyId={id}
        />
      )}
    </div>
  );
}
