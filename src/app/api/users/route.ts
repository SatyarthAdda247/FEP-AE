import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import type { User } from "@/types";

// GET — list all faculty (with subject filter)
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");

  const scanned = await scanAll({
    TableName: TABLES.USERS,
    FilterExpression: "#r = :f OR (#r = :m AND cohort = :march)",
    ExpressionAttributeNames: { "#r": "role" },
    ExpressionAttributeValues: {
      ":f": "eduskill_faculty",
      ":m": "eduskill_manager",
      ":march": "March EduSkill"
    },
  });
  let items = scanned as unknown as User[];
  if (subjectId) {
    items = items.filter((u) => (u.subjects ?? []).includes(subjectId));
  }
  // Strip password hashes
  items = items.map((u) => {
    const { passwordHash: _ph, ...rest } = u;
    void _ph;
    return rest as User;
  });

  return NextResponse.json({ users: items });
}

// PUT — Update user details (Name, Age, DOB, Subjects, Avatar/Profile Photo)
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (user.role === "eduskill_viewer") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, name, age, dob, subjects, avatarUrl, gender, teachingSubject, cohort, examTarget } = body;

  // Faculty can only update themselves. Managers/admins can update anyone.
  const targetUserId = userId || user.userId;
  if (user.role === "eduskill_faculty" && targetUserId !== user.userId) {
    // Check if the emails match as a fallback (handles stale JWT userIds for merged/reconciled accounts)
    try {
      const targetUserRes = await ddb.send(
        new GetCommand({ TableName: TABLES.USERS, Key: { userId: targetUserId } })
      );
      const targetDbUser = targetUserRes.Item as User | undefined;
      if (!targetDbUser || targetDbUser.email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    } catch (err) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");

  // Build update expression dynamically based on provided fields
  const updateFields: Record<string, unknown> = {};
  if (name !== undefined) updateFields.name = name;
  if (age !== undefined) updateFields.age = Number(age);
  if (dob !== undefined) updateFields.dob = dob;
  if (subjects !== undefined) updateFields.subjects = subjects;
  if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;
  if (gender !== undefined) updateFields.gender = gender;
  if (teachingSubject !== undefined) updateFields.teachingSubject = teachingSubject;
  if (cohort !== undefined) updateFields.cohort = cohort;
  if (examTarget !== undefined) updateFields.examTarget = examTarget;

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updateParts: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    updateParts.push(`#${key} = :${key}`);
    expressionAttributeNames[`#${key}`] = key;
    expressionAttributeValues[`:${key}`] = value;
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: targetUserId },
        UpdateExpression: `SET ${updateParts.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    return NextResponse.json({ success: true, message: "Profile updated successfully" });
  } catch (error: any) {
    console.error("Error updating profile in DynamoDB:", error);
    return NextResponse.json(
      { error: "Failed to update profile", details: error.message },
      { status: 500 }
    );
  }
}

