"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function setupFirstAdminAction(
  _prevState: { error?: string; success?: string } | null,
  formData: FormData
) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email?.trim() || !password?.trim() || !name?.trim()) {
    return { error: "Tous les champs sont requis." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const { data, error } = await auth.signUp.email({
    email: email.trim(),
    password: password.trim(),
    name: name.trim(),
  });

  if (error) {
    return { error: error.message || "Échec de la création du compte." };
  }

  if (data?.user) {
    redirect(
      "/?setup=1"
    );
  }

  return { error: "Une erreur inattendue s'est produite." };
}
