import { NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { requireRole } from "@/lib/auth";
import type { Cohort, User } from "@/types";

const requireAdmin = () => requireRole(["eduskill_admin"]);

// GET — list all pending applications
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const items = await scanAll({
    TableName: TABLES.USERS,
    FilterExpression: "approvalStatus = :p",
    ExpressionAttributeValues: { ":p": "pending" },
  });
  const pending = (items as unknown as User[])
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

  // userId is the table's partition key — a direct Get, not a Scan
  const userRes = await ddb.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId } }));
  const user = userRes.Item as User | undefined;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.approvalStatus !== "pending") {
    return NextResponse.json({ error: "This application has already been processed" }, { status: 409 });
  }

  // Enforce the cohort seat limit at approval time
  if (action === "approve" && user.cohort) {
    const cohortItems = await scanAll({
      TableName: TABLES.COHORTS,
      FilterExpression: "#n = :n",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: { ":n": user.cohort },
    });
    const cohort = cohortItems[0] as unknown as Cohort | undefined;
    if (cohort?.capacity) {
      const memberItems = await scanAll({
        TableName: TABLES.USERS,
        FilterExpression: "cohort = :c",
        ExpressionAttributeValues: { ":c": user.cohort },
        ProjectionExpression: "approvalStatus",
      });
      const enrolled = memberItems.filter(
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
