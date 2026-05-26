export type AppRole = "user" | "admin" | "lecteur";

export function asAppRole(role: unknown): AppRole | null {
  if (role === "admin" || role === "user" || role === "lecteur") {
    return role;
  }
  return null;
}

export function isReaderRole(role: unknown): boolean {
  return asAppRole(role) === "lecteur";
}

export function canMutate(role: unknown): boolean {
  const appRole = asAppRole(role);
  return appRole === "admin" || appRole === "user";
}

export function canAccessTransactions(role: unknown): boolean {
  const appRole = asAppRole(role);
  return appRole === "admin" || appRole === "user";
}
