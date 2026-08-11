import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import type { Cohort, User } from "@/types";

// Public — self-registration via a cohort invite link.
// Creates a PENDING application; an admin must approve it before the user can
// log in. New accounts are always faculty; roles are elevated by an admin.
export async function POST(req: Request) {
  try {
    const { inviteCode, name, email, password, phone, teachingSubject, dob, videoSampleLink, resumeLink } = await req.json();

    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
    if (!inviteCode || !cleanName || !cleanEmail || !password) {
      return NextResponse.json(
        { error: "Invite code, name, email and password are required" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(String(dob))) {
      return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
    }
    for (const [label, link] of [["Video sample link", videoSampleLink], ["Resume link", resumeLink]] as const) {
      if (link && !/^https?:\/\/\S+$/.test(String(link))) {
        return NextResponse.json({ error: `${label} must be a valid URL (starting with http:// or https://)` }, { status: 400 });
      }
    }

    const cohortRes = await ddb.send(new QueryCommand({
      TableName: TABLES.COHORTS,
      IndexName: "inviteCode-index",
      KeyConditionExpression: "inviteCode = :c",
      ExpressionAttributeValues: { ":c": String(inviteCode) },
      Limit: 1,
    }));
    const cohort = cohortRes.Items?.[0] as Cohort | undefined;
    if (!cohort) {
      return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 404 });
    }
    if (!cohort.signupOpen) {
      return NextResponse.json({ error: "Signups for this cohort are closed" }, { status: 403 });
    }

    // Capacity check — enrolled = members not pending/rejected (legacy users have no status)
    if (cohort.capacity) {
      const memberItems = await scanAll({
        TableName: TABLES.USERS,
        FilterExpression: "cohort = :c",
        ExpressionAttributeValues: { ":c": cohort.name },
        ProjectionExpression: "approvalStatus",
      });
      const enrolled = memberItems.filter(
        m => m.approvalStatus !== "pending" && m.approvalStatus !== "rejected"
      ).length;
      if (enrolled >= cohort.capacity) {
        return NextResponse.json(
          { error: "This cohort is full and is no longer accepting applications" },
          { status: 403 }
        );
      }
    }

    const existing = await ddb.send(new QueryCommand({
      TableName: TABLES.USERS,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": cleanEmail },
      Limit: 1,
    }));
    if (existing.Items?.length) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead." },
        { status: 409 }
      );
    }

    const user: User = {
      userId: uuid(),
      name: cleanName,
      email: cleanEmail,
      phone: phone || undefined,
      role: "eduskill_faculty",
      subjects: [],
      teachingSubject: teachingSubject || undefined,
      dob: dob || undefined,
      videoSampleLink: videoSampleLink || undefined,
      resumeLink: resumeLink || undefined,
      cohort: cohort.name,
      approvalStatus: "pending",
      passwordHash: await bcrypt.hash(String(password), 10),
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: TABLES.USERS, Item: user }));

    // No session cookie — the account is unusable until an admin approves it
    return NextResponse.json({
      pending: true,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        cohort: user.cohort,
      },
    });
  } catch (e) {
    console.error("signup error:", e);
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
