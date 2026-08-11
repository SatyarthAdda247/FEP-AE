import type { Role } from "@/types";

/**
 * Shared by lib/auth.ts (Node runtime) and proxy.ts (Edge middleware) — no
 * Next.js-specific imports here so both runtimes can safely pull it in.
 */

let warnedMissingSecret = false;

export function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (!warnedMissingSecret) {
      // Loud, once per process: signing/verifying with a fallback that's
      // public in source control means anyone can forge an admin session.
      console.error(
        "[auth] JWT_SECRET is not set — falling back to a publicly-known " +
        "dev secret. Set JWT_SECRET in this environment before going to production."
      );
      warnedMissingSecret = true;
    }
    return new TextEncoder().encode("dev-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

const LEGACY_ROLE_MAP: Record<string, Role> = {
  fep_faculty: "eduskill_faculty",
  fep_manager: "eduskill_manager",
  fep_admin: "eduskill_admin",
};

/** Maps pre-rename role strings (fep_*) forward to eduskill_* so old JWTs
 *  issued before the rename still resolve to a valid role. */
export function normalizeRole<T extends string | undefined>(role: T): T {
  if (typeof role !== "string") return role;
  return (LEGACY_ROLE_MAP[role] ?? role) as T;
}
