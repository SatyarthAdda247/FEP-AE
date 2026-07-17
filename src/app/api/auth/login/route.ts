import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import { signToken, setAuthCookie } from "@/lib/auth";
import type { User } from "@/types";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: "email-index",
        KeyConditionExpression: "email = :e",
        ExpressionAttributeValues: { ":e": String(email).toLowerCase().trim() },
        Limit: 1,
      })
    );

    const user = result.Items?.[0] as User | undefined;
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (user.approvalStatus === "pending") {
      return NextResponse.json(
        { error: "Your application is awaiting admin approval. You'll be able to log in once approved." },
        { status: 403 }
      );
    }
    if (user.approvalStatus === "rejected") {
      return NextResponse.json(
        { error: "Your application was not approved. Contact your program admin for details." },
        { status: 403 }
      );
    }

    const token = await signToken({
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    await setAuthCookie(token);

    return NextResponse.json({
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        subjects: user.subjects,
      },
    });
  } catch (e) {
    console.error("login error:", e);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
