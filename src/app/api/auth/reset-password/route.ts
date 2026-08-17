import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { verifyOtp, normalizePhone } from "@/lib/otp";
import type { User } from "@/types";

const digits10 = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

// POST { phone, code, newPassword } — verify the password-reset OTP and set a
// new password. Only works for an already-onboarded account with a password.
export async function POST(req: Request) {
  const { phone, code, newPassword } = await req.json().catch(() => ({}));
  const p = normalizePhone(phone);
  if (p.length !== 10 || !code) {
    return NextResponse.json({ error: "Mobile number and code are required" }, { status: 400 });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Verify the OTP first (consumes it on success)
  const otp = await verifyOtp(p, "password_reset", String(code));
  if (!otp.ok) {
    return NextResponse.json({ error: otp.error }, { status: 400 });
  }

  const users = await scanAll({
    TableName: TABLES.USERS,
    FilterExpression: "phone = :p",
    ExpressionAttributeValues: { ":p": p },
  });
  const user = users.find(u => digits10(u.phone) === p) as User | undefined;
  if (!user || user.profileComplete === false || !user.passwordHash) {
    return NextResponse.json({ error: "No account is set up for this mobile number." }, { status: 404 });
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLES.USERS,
    Key: { userId: user.userId },
    UpdateExpression: "SET passwordHash = :h",
    ExpressionAttributeValues: { ":h": await bcrypt.hash(newPassword, 10) },
  }));

  return NextResponse.json({ ok: true });
}
