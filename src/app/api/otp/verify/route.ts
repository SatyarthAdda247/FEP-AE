import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getJwtSecretKey } from "@/lib/jwt";
import { verifyOtp, normalizePhone, type OtpPurpose } from "@/lib/otp";

const VALID_PURPOSES: OtpPurpose[] = ["password_reset", "phone_verify"];

// POST { phone, purpose, code } — verify an OTP. On success returns a
// short-lived (10 min) signed proof token the caller can present to the
// action that required verification.
export async function POST(req: Request) {
  const { phone, purpose, code } = await req.json().catch(() => ({}));
  const p = normalizePhone(phone);
  if (p.length !== 10 || !VALID_PURPOSES.includes(purpose) || !code) {
    return NextResponse.json({ error: "phone, purpose and code are required" }, { status: 400 });
  }

  const result = await verifyOtp(p, purpose, String(code));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const token = await new SignJWT({ phone: p, purpose, otp: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getJwtSecretKey());

  return NextResponse.json({ ok: true, token });
}
