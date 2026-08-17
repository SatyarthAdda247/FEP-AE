import { NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
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

// GET — list profile change & access requests from TABLES.USERS
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedUserId = searchParams.get("userId");

  try {
    const allUsers = (await scanAll({ TableName: TABLES.USERS })) as unknown as (User & {
      editPermissionStatus?: string;
      editRequestedAt?: string;
    })[];

    const requests: ProfileEditRequestItem[] = [];

    for (const u of allUsers) {
      if (u.editPermissionStatus === "requested") {
        requests.push({
          requestId: u.userId,
          userId: u.userId,
          userName: u.name,
          userEmail: u.email,
          cohort: u.cohort,
          type: "access_request",
          status: "pending",
          createdAt: u.editRequestedAt || new Date().toISOString(),
        });
      }
    }

    let filtered = requests;
    if (user.role === "eduskill_faculty") {
      filtered = requests.filter((r) => r.userId === user.userId);
    } else if (requestedUserId) {
      filtered = requests.filter((r) => r.userId === requestedUserId);
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return NextResponse.json({ requests: filtered });
  } catch (err: any) {
    console.error("Error fetching profile requests:", err);
    return NextResponse.json({ requests: [] });
  }
}

// POST — submit a profile edit or access request
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
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

  const now = new Date().toISOString();

  // Faculty requesting editing rights
  if (type === "access_request" || action === "request_access" || !changes) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: targetUserId },
        UpdateExpression: "SET editPermissionStatus = :eps, editRequestedAt = :era",
        ExpressionAttributeValues: {
          ":eps": "requested",
          ":era": now,
        },
      })
    );

    return NextResponse.json({
      success: true,
      editPermissionStatus: "requested",
      message: "Editing rights request submitted for admin approval",
    });
  }

  // If user is Admin or Manager, auto-apply the change directly!
  const isAdminOrManager = user.role === "eduskill_admin" || user.role === "eduskill_manager";

  if (isAdminOrManager) {
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

  return NextResponse.json({
    success: true,
    message: "Profile edit request submitted for admin approval",
  });
}
