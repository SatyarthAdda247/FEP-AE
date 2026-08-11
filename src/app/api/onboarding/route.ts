import { NextResponse } from "next/server";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import { validateOnboardingExtras } from "@/lib/onboarding";
import type { User } from "@/types";

// GET — the caller's own profile, prefilled for the onboarding form
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const res = await ddb.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId: user.userId } }));
  const dbUser = res.Item as User | undefined;
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { passwordHash: _, ...safe } = dbUser;
  return NextResponse.json({ user: safe });
}

// PUT — the caller completes/updates their own onboarding profile
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { name, email, phone } = body;

  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
  const cleanPhone = typeof phone === "string" ? phone.trim() : "";
  if (!cleanName || !cleanEmail || !cleanPhone) {
    return NextResponse.json({ error: "Name, email and mobile number are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  const normalizedPhoneDigits = cleanPhone.replace(/\D/g, "").slice(-10);
  if (!/^\+?\d{10,15}$/.test(cleanPhone.replace(/[\s-]/g, ""))) {
    return NextResponse.json({ error: "Invalid mobile number" }, { status: 400 });
  }

  const extras = validateOnboardingExtras(body, normalizedPhoneDigits);
  if ("error" in extras) {
    return NextResponse.json({ error: extras.error }, { status: 400 });
  }

  // Email must stay unique across accounts (excluding self)
  const existing = await ddb.send(new QueryCommand({
    TableName: TABLES.USERS,
    IndexName: "email-index",
    KeyConditionExpression: "email = :e",
    ExpressionAttributeValues: { ":e": cleanEmail },
    Limit: 1,
  }));
  const other = existing.Items?.[0] as User | undefined;
  if (other && other.userId !== user.userId) {
    return NextResponse.json({ error: "This email is already in use by another account" }, { status: 409 });
  }

  const fields: Record<string, unknown> = {
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    profileComplete: true,
    onboardedAt: new Date().toISOString(),
    ...extras.fields,
  };

  const parts: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    parts.push(`#${key} = :${key}`);
    names[`#${key}`] = key;
    values[`:${key}`] = value;
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLES.USERS,
    Key: { userId: user.userId },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  return NextResponse.json({ ok: true });
}
