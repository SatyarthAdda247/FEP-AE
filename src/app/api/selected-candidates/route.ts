import { NextResponse } from "next/server";
import { GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser, requireRole } from "@/lib/auth";
import type { SelectedCandidate, User } from "@/types";

const requireManager = () => requireRole(["eduskill_manager", "eduskill_admin"]);

// GET ?cohort= — selected candidates for a cohort (all cohorts if omitted).
// Viewers may read; only managers/admins may mutate.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "eduskill_faculty") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cohort = searchParams.get("cohort");

  const [selectedItems, userItems] = await Promise.all([
    scanAll({ TableName: TABLES.SELECTED }),
    scanAll({
      TableName: TABLES.USERS,
      ProjectionExpression: "userId, #n, phone, cohort",
      ExpressionAttributeNames: { "#n": "name" },
    }),
  ]);
  let candidates = selectedItems as unknown as SelectedCandidate[];
  if (cohort) candidates = candidates.filter(c => c.cohort === cohort);
  candidates.sort((a, b) => (a.regNo ?? a.name).localeCompare(b.regNo ?? b.name));

  // Link candidates to dashboard profiles: roster-selected ones carry
  // sourceUserId; sheet imports are matched by phone, else by name+cohort.
  const users = userItems as unknown as Pick<User, "userId" | "name" | "phone" | "cohort">[];
  const lastTen = (s?: string) => (s ?? "").replace(/\D/g, "").slice(-10);
  const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const byPhone = new Map<string, string>();
  const byNameCohort = new Map<string, string>();
  for (const u of users) {
    const p = lastTen(u.phone);
    if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, u.userId);
    const key = `${norm(u.name)}|${u.cohort ?? ""}`;
    if (norm(u.name) && !byNameCohort.has(key)) byNameCohort.set(key, u.userId);
  }
  const enriched = candidates.map(c => ({
    ...c,
    profileUserId:
      c.sourceUserId ??
      byPhone.get(lastTen(c.contact)) ??
      byNameCohort.get(`${norm(c.name)}|${c.cohort}`) ??
      null,
  }));

  return NextResponse.json({
    candidates: enriched,
    // userIds already selected — lets the roster render toggle state
    selectedUserIds: candidates.filter(c => c.sourceUserId).map(c => c.sourceUserId),
  });
}

// POST { userId } — toggle-select a roster faculty as a candidate
export async function POST(req: Request) {
  const manager = await requireManager();
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const candidateId = `user-${userId}`;

  // Toggle off if already selected — candidateId is the table's partition key
  const existing = await ddb.send(new GetCommand({ TableName: TABLES.SELECTED, Key: { candidateId } }));
  if (existing.Item) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.SELECTED, Key: { candidateId } }));
    return NextResponse.json({ selected: false });
  }

  // userId is the fep-users table's partition key
  const userRes = await ddb.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId } }));
  const user = userRes.Item as User | undefined;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const candidate: SelectedCandidate = {
    candidateId,
    cohort: user.cohort ?? "Unassigned",
    name: user.name,
    contact: user.phone,
    subject: user.teachingSubject,
    vertical: user.subjects?.join(", ") || undefined,
    resumeLink: user.resumeLink,
    videoLink: user.videoSampleLink,
    sourceUserId: user.userId,
    selectedBy: manager.userId,
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLES.SELECTED, Item: candidate }));
  return NextResponse.json({ selected: true, candidate });
}

// PUT — edit a candidate's details
const EDITABLE_FIELDS = [
  "name", "regNo", "contact", "subject", "vertical",
  "replacement", "newInitiatives", "offlineEducators",
  "resumeLink", "videoLink",
] as const;

export async function PUT(req: Request) {
  const manager = await requireManager();
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { candidateId } = body;
  if (!candidateId) return NextResponse.json({ error: "candidateId required" }, { status: 400 });
  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const sets: string[] = [];
  const removes: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    names[`#${field}`] = field;
    const v = typeof body[field] === "string" ? body[field].trim() : body[field];
    if (v === "" || v === null) {
      removes.push(`#${field}`);
    } else {
      sets.push(`#${field} = :${field}`);
      values[`:${field}`] = v;
    }
  }
  if (!sets.length && !removes.length) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const expr = [
    sets.length ? `SET ${sets.join(", ")}` : "",
    removes.length ? `REMOVE ${removes.join(", ")}` : "",
  ].filter(Boolean).join(" ");

  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLES.SELECTED,
      Key: { candidateId },
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
      ConditionExpression: "attribute_exists(candidateId)",
    }));
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}

// DELETE { candidateId } — remove a candidate from the selected list
export async function DELETE(req: Request) {
  const manager = await requireManager();
  if (!manager) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { candidateId } = await req.json();
  if (!candidateId) return NextResponse.json({ error: "candidateId required" }, { status: 400 });

  await ddb.send(new DeleteCommand({ TableName: TABLES.SELECTED, Key: { candidateId } }));
  return NextResponse.json({ ok: true });
}
