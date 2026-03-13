"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signInWithEmail(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email et mot de passe requis." };
  }

  const { error } = await auth.signIn.email({
    email,
    password,
  });

  if (error) {
    // Surface the actual error for debugging (e.g. "Invalid credentials", network errors)
    return { error: error.message || "Échec de la connexion. Réessayez." };
  }

  redirect("/");
}
