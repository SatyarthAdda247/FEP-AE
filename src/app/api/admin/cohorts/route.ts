import { NextResponse } from "next/server";
import { ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { requireRole } from "@/lib/auth";
import type { Cohort, User } from "@/types";

const requireAdmin = () => requireRole(["eduskill_admin"]);

// URL-safe, unambiguous (no 0/O, 1/l/I) invite code
function generateInviteCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

// GET — list all cohorts with member counts
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const [cohortItems, userItems] = await Promise.all([
    scanAll({ TableName: TABLES.COHORTS }),
    scanAll({ TableName: TABLES.USERS, ProjectionExpression: "cohort, approvalStatus" }),
  ]);

  // Enrolled = not pending/rejected (legacy records have no approvalStatus)
  const enrolledCounts = new Map<string, number>();
  const pendingCounts = new Map<string, number>();
  for (const u of userItems as Pick<User, "cohort" | "approvalStatus">[]) {
    if (!u.cohort) continue;
    if (u.approvalStatus === "pending") {
      pendingCounts.set(u.cohort, (pendingCounts.get(u.cohort) ?? 0) + 1);
    } else if (u.approvalStatus !== "rejected") {
      enrolledCounts.set(u.cohort, (enrolledCounts.get(u.cohort) ?? 0) + 1);
    }
  }

  const cohorts = (cohortItems as unknown as Cohort[])
    .map(c => ({
      ...c,
      memberCount: enrolledCounts.get(c.name) ?? 0,
      pendingCount: pendingCounts.get(c.name) ?? 0,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Legacy cohorts exist only as strings on user records — surface them too
  const registered = new Set(cohorts.map(c => c.name));
  const legacy = Array.from(enrolledCounts.entries())
    .filter(([name]) => !registered.has(name))
    .map(([name, memberCount]) => ({ name, memberCount }));

  return NextResponse.json({ cohorts, legacy });
}

// POST — create a cohort (one click: only a name is needed)
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { name, capacity } = await req.json();
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return NextResponse.json({ error: "Cohort name required" }, { status: 400 });
  const cap = capacity !== undefined && capacity !== null && capacity !== "" ? Number(capacity) : undefined;
  if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) {
    return NextResponse.json({ error: "Capacity must be a positive whole number" }, { status: 400 });
  }

  const existing = await ddb.send(new ScanCommand({
    TableName: TABLES.COHORTS,
    FilterExpression: "#n = :n",
    ExpressionAttributeNames: { "#n": "name" },
    ExpressionAttributeValues: { ":n": trimmed },
  }));
  if (existing.Items?.length) {
    return NextResponse.json({ error: "A cohort with this name already exists" }, { status: 409 });
  }

  const cohort: Cohort = {
    cohortId: uuid(),
    name: trimmed,
    inviteCode: generateInviteCode(),
    signupOpen: true,
    capacity: cap,
    createdBy: admin.userId,
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.COHORTS, Item: cohort }));
  return NextResponse.json({ cohort });
}

// PUT — toggle signup open/closed or regenerate the invite code
export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { cohortId, signupOpen, regenerateCode, capacity } = await req.json();
  if (!cohortId) return NextResponse.json({ error: "cohortId required" }, { status: 400 });

  const parts: string[] = [];
  const values: Record<string, unknown> = {};
  if (typeof signupOpen === "boolean") {
    parts.push("signupOpen = :o");
    values[":o"] = signupOpen;
  }
  if (regenerateCode) {
    parts.push("inviteCode = :c");
    values[":c"] = generateInviteCode();
  }
  if (capacity !== undefined) {
    // null / "" / 0 clears the limit
    const cap = capacity === null || capacity === "" || Number(capacity) === 0 ? null : Number(capacity);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
      return NextResponse.json({ error: "Capacity must be a positive whole number" }, { status: 400 });
    }
    parts.push("capacity = :cap");
    values[":cap"] = cap;
  }
  if (!parts.length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  await ddb.send(new UpdateCommand({
    TableName: TABLES.COHORTS,
    Key: { cohortId },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeValues: values,
    ConditionExpression: "attribute_exists(cohortId)",
  }));
  return NextResponse.json({ ok: true, inviteCode: values[":c"] ?? undefined });
}

// DELETE — remove a cohort (members keep their cohort label; the invite link dies)
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { cohortId } = await req.json();
  if (!cohortId) return NextResponse.json({ error: "cohortId required" }, { status: 400 });

  await ddb.send(new DeleteCommand({ TableName: TABLES.COHORTS, Key: { cohortId } }));
  return NextResponse.json({ ok: true });
}
