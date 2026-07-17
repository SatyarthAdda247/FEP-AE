import { NextResponse } from "next/server";
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import type { Cohort, User } from "@/types";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "eduskill_admin") return null;
  return user;
}

// GET — list all pending applications
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const r = await ddb.send(new ScanCommand({
    TableName: TABLES.USERS,
    FilterExpression: "approvalStatus = :p",
    ExpressionAttributeValues: { ":p": "pending" },
  }));
  const pending = ((r.Items ?? []) as User[])
    .map(({ passwordHash: _, ...u }) => u)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return NextResponse.json({ pending });
}

// POST — approve or reject an application
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { userId, action } = await req.json();
  if (!userId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "userId and action (approve|reject) required" }, { status: 400 });
  }

  const r = await ddb.send(new ScanCommand({
    TableName: TABLES.USERS,
    FilterExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
  }));
  const user = r.Items?.[0] as User | undefined;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.approvalStatus !== "pending") {
    return NextResponse.json({ error: "This application has already been processed" }, { status: 409 });
  }

  // Enforce the cohort seat limit at approval time
  if (action === "approve" && user.cohort) {
    const cohortRes = await ddb.send(new ScanCommand({
      TableName: TABLES.COHORTS,
      FilterExpression: "#n = :n",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: { ":n": user.cohort },
    }));
    const cohort = cohortRes.Items?.[0] as Cohort | undefined;
    if (cohort?.capacity) {
      const members = await ddb.send(new ScanCommand({
        TableName: TABLES.USERS,
        FilterExpression: "cohort = :c",
        ExpressionAttributeValues: { ":c": user.cohort },
        ProjectionExpression: "approvalStatus",
      }));
      const enrolled = (members.Items ?? []).filter(
        m => m.approvalStatus !== "pending" && m.approvalStatus !== "rejected"
      ).length;
      if (enrolled >= cohort.capacity) {
        return NextResponse.json(
          { error: `Cohort "${user.cohort}" is full (${enrolled}/${cohort.capacity} seats). Increase its capacity to approve more members.` },
          { status: 409 }
        );
      }
    }
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLES.USERS,
    Key: { userId },
    UpdateExpression: "SET approvalStatus = :s",
    ExpressionAttributeValues: { ":s": action === "approve" ? "approved" : "rejected" },
  }));
  return NextResponse.json({ ok: true, status: action === "approve" ? "approved" : "rejected" });
}
