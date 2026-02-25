"use server";

import { auth } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

export async function createUserAction(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!email?.trim()) {
    return { error: "L'email est requis." };
  }
  if (!password?.trim()) {
    return { error: "Le mot de passe est requis." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (!name?.trim()) {
    return { error: "Le nom est requis." };
  }

  const authWithAdmin = auth as {
    admin: {
      createUser: (opts: {
        email: string;
        password: string;
        name: string;
        role?: string;
      }) => Promise<{ error?: { message: string } }>;
    };
  };
  const { error } = await authWithAdmin.admin.createUser({
    email: email.trim(),
    password: password.trim(),
    name: name.trim(),
    role: "user",
  });

  if (error) {
    return { error: error.message || "Échec de la création du compte." };
  }

  revalidatePath("/settings");
  return null;
}
