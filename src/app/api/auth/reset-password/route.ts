import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import type { User } from "@/types";

const digits10 = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

// Widget auth key for server-side token verification. The widget tokenAuth is
// client-public; env overrides it if a distinct panel AuthKey is preferred.
const MSG91_WIDGET_AUTHKEY = process.env.MSG91_WIDGET_AUTHKEY || "561716T0Weq8Je6a83f013P1";

/** Verify the MSG91 widget access token; returns the verified 10-digit phone. */
async function verifyMsg91Token(accessToken: string): Promise<string | null> {
  const res = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authkey: MSG91_WIDGET_AUTHKEY, "access-token": accessToken }),
  });
  const data = await res.json().catch(() => null) as { type?: string; message?: string } | null;
  if (!res.ok || data?.type !== "success") return null;
  // `message` holds the verified identifier (e.g. "916392863687")
  const phone = digits10(data?.message);
  return phone.length === 10 ? phone : null;
}

// POST { msg91Token, newPassword } — verify the OTP token from the MSG91
// widget and set a new password. Only works for an already-onboarded account.
export async function POST(req: Request) {
  const { msg91Token, newPassword } = await req.json().catch(() => ({}));
  if (!msg91Token || typeof msg91Token !== "string") {
    return NextResponse.json({ error: "Phone verification is required" }, { status: 400 });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const phone = await verifyMsg91Token(msg91Token);
  if (!phone) {
    return NextResponse.json({ error: "Phone verification failed. Please request a new code." }, { status: 400 });
  }

  const users = await scanAll({
    TableName: TABLES.USERS,
    FilterExpression: "phone = :p",
    ExpressionAttributeValues: { ":p": phone },
  });
  const user = users.find(u => digits10(u.phone) === phone) as User | undefined;
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
