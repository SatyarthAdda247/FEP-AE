import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getJwtSecretKey, normalizeRole } from "@/lib/jwt";
import type { JWTPayload, Role } from "@/types";

const COOKIE_NAME = "fep_token";

export async function signToken(payload: JWTPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretKey());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const typed = payload as unknown as JWTPayload;
    if (typed) typed.role = normalizeRole(typed.role as Role);
    return typed;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<JWTPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireUser(): Promise<JWTPayload> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

/** Returns the current user if their role is in `roles`, else null.
 *  Use in API routes: `const admin = await requireRole(["eduskill_admin"]);` */
export async function requireRole(roles: Role[]): Promise<JWTPayload | null> {
  const u = await getCurrentUser();
  if (!u || !roles.includes(u.role)) return null;
  return u;
}

export const AUTH_COOKIE = COOKIE_NAME;
