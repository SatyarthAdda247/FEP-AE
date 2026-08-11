import { NextResponse } from "next/server";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { signToken, setAuthCookie } from "@/lib/auth";
import type { User } from "@/types";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

// No phone-index GSI exists yet — scanAll pages through the full table so
// a real account is never missed to a truncated single Scan page.
async function findByPhone(phone: string): Promise<User | undefined> {
  const items = await scanAll({
    TableName: TABLES.USERS,
    FilterExpression: "phone = :p",
    ExpressionAttributeValues: { ":p": phone },
  });
  return items[0] as unknown as User | undefined;
}

// GET ?phone= — public lookup so the onboarding form can greet an
// unclaimed pre-created account by name before asking for the rest.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = normalizePhone(searchParams.get("phone") ?? "");
  if (phone.length !== 10) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
  }

  const user = await findByPhone(phone);
  if (!user) {
    return NextResponse.json({ error: "No pending account found for this number. Contact your program admin." }, { status: 404 });
  }
  if (user.profileComplete === false) {
    return NextResponse.json({ found: true, name: user.name, cohort: user.cohort ?? null });
  }
  return NextResponse.json({ error: "This account has already been set up. Please sign in instead." }, { status: 409 });
}

// POST — public account claim: identify by phone, create the account's
// FIRST password (no prior password is ever asked for), save the rest of
// the onboarding form, and log the user in.
export async function POST(req: Request) {
  const body = await req.json();
  const { phone, name, email, address, age, gender, tshirtSize, password, confirmPassword } = body;

  const cleanPhone = normalizePhone(typeof phone === "string" ? phone : "");
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";

  if (cleanPhone.length !== 10 || !cleanName || !cleanEmail) {
    return NextResponse.json({ error: "Mobile number, name and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }
  const ageNum = age !== undefined && age !== null && age !== "" ? Number(age) : undefined;
  if (ageNum !== undefined && (!Number.isFinite(ageNum) || ageNum < 10 || ageNum > 100)) {
    return NextResponse.json({ error: "Invalid age" }, { status: 400 });
  }

  const target = await findByPhone(cleanPhone);
  if (!target) {
    return NextResponse.json({ error: "No pending account found for this number. Contact your program admin." }, { status: 404 });
  }
  if (target.profileComplete !== false) {
    return NextResponse.json({ error: "This account has already been set up. Please sign in instead." }, { status: 409 });
  }

  // Email must stay unique across accounts (excluding the account being claimed)
  const existing = await ddb.send(new QueryCommand({
    TableName: TABLES.USERS,
    IndexName: "email-index",
    KeyConditionExpression: "email = :e",
    ExpressionAttributeValues: { ":e": cleanEmail },
    Limit: 1,
  }));
  const other = existing.Items?.[0] as User | undefined;
  if (other && other.userId !== target.userId) {
    return NextResponse.json({ error: "This email is already in use by another account" }, { status: 409 });
  }

  const fields: Record<string, unknown> = {
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    passwordHash: await bcrypt.hash(password, 10),
    profileComplete: true,
    onboardedAt: new Date().toISOString(),
  };
  if (address) fields.address = String(address).trim();
  if (gender) fields.gender = String(gender).trim();
  if (tshirtSize) fields.tshirtSize = String(tshirtSize).trim();
  if (ageNum !== undefined) fields.age = ageNum;

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
    Key: { userId: target.userId },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  const token = await signToken({
    userId: target.userId,
    email: cleanEmail,
    name: cleanName,
    role: target.role,
  });
  await setAuthCookie(token);

  return NextResponse.json({ user: { userId: target.userId, name: cleanName, email: cleanEmail, role: target.role } });
}
