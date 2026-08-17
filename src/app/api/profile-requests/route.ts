import { NextResponse } from "next/server";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import type { User } from "@/types";

export interface ProfileEditRequestItem {
  requestId: string;
  userId: string;
  userName: string;
  userEmail: string;
  cohort?: string;
  type?: "access_request" | "edit_request";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  changes?: Record<string, unknown>;
  currentValues?: Record<string, unknown>;
}

// GET — list profile change & access requests (admin gets all, faculty gets their own)
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedUserId = searchParams.get("userId");

  const items = (await scanAll({ TableName: TABLES.PROFILE_REQUESTS })) as unknown as ProfileEditRequestItem[];

  let filtered = items;
  if (user.role === "eduskill_faculty") {
    filtered = items.filter((r) => r.userId === user.userId);
  } else if (requestedUserId) {
    filtered = items.filter((r) => r.userId === requestedUserId);
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ requests: filtered });
}

// POST — submit a profile edit or access request
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { userId, changes, type, action } = body;

  const targetUserId = userId || user.userId;
  if (user.role === "eduskill_faculty" && targetUserId !== user.userId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Fetch current user details
  const userRes = await ddb.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId: targetUserId } }));
  const dbUser = userRes.Item as User | undefined;
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");

  // Case 1: Faculty requesting editing rights
  if (type === "access_request" || action === "request_access") {
    // Set editPermissionStatus to "requested" on user record
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: targetUserId },
        UpdateExpression: "SET editPermissionStatus = :eps",
        ExpressionAttributeValues: { ":eps": "requested" },
      })
    );

    const requestId = uuid();
    const requestItem: ProfileEditRequestItem = {
      requestId,
      userId: targetUserId,
      userName: dbUser.name,
      userEmail: dbUser.email,
      cohort: dbUser.cohort,
      type: "access_request",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLES.PROFILE_REQUESTS,
        Item: requestItem,
      })
    );

    return NextResponse.json({
      success: true,
      editPermissionStatus: "requested",
      message: "Editing rights request submitted for admin approval",
    });
  }

  if (!changes || Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No changes specified" }, { status: 400 });
  }

  // If user is Admin or Manager, auto-apply the change directly!
  const isAdminOrManager = user.role === "eduskill_admin" || user.role === "eduskill_manager";

  if (isAdminOrManager) {
    const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    const updateParts: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(changes)) {
      updateParts.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: targetUserId },
        UpdateExpression: `SET ${updateParts.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );

    return NextResponse.json({
      success: true,
      autoApproved: true,
      message: "Profile details updated directly",
    });
  }

  // Otherwise (Faculty submission), create a pending approval request
  const currentValues: Record<string, unknown> = {};
  for (const key of Object.keys(changes)) {
    currentValues[key] = (dbUser as any)[key] ?? null;
  }

  const requestId = uuid();
  const requestItem: ProfileEditRequestItem = {
    requestId,
    userId: targetUserId,
    userName: dbUser.name,
    userEmail: dbUser.email,
    cohort: dbUser.cohort,
    status: "pending",
    createdAt: new Date().toISOString(),
    changes,
    currentValues,
  };

  await ddb.send(
    new PutCommand({
      TableName: TABLES.PROFILE_REQUESTS,
      Item: requestItem,
    })
  );

  return NextResponse.json({
    success: true,
    pendingApproval: true,
    requestId,
    message: "Profile edit request submitted for admin approval",
  });
}
