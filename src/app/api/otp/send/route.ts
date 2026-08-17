import { NextResponse } from "next/server";
import { TABLES, scanAll } from "@/lib/dynamodb";
import { sendOtp, normalizePhone, type OtpPurpose } from "@/lib/otp";
import type { User } from "@/types";

const VALID_PURPOSES: OtpPurpose[] = ["password_reset", "phone_verify"];

const digits10 = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

// POST { phone, purpose } — send a 6-digit OTP to the phone.
export async function POST(req: Request) {
  const { phone, purpose } = await req.json().catch(() => ({}));
  const p = normalizePhone(phone);
  if (p.length !== 10) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
  }
  if (!VALID_PURPOSES.includes(purpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }

  // For password reset, only send to an existing onboarded account — but never
  // reveal whether the number exists (return ok either way to prevent enumeration).
  if (purpose === "password_reset") {
    const users = await scanAll({
      TableName: TABLES.USERS,
      FilterExpression: "phone = :p",
      ExpressionAttributeValues: { ":p": p },
      ProjectionExpression: "phone, profileComplete, passwordHash",
    });
    const user = users.find(u => digits10(u.phone) === p) as User | undefined;
    if (!user || user.profileComplete === false || !user.passwordHash) {
      return NextResponse.json({ ok: true }); // silent no-op
    }
  }

  const result = await sendOtp(p, purpose);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 429 });
  }
  return NextResponse.json({ ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
}
