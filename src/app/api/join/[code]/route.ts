import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import type { Cohort } from "@/types";

// Public — validate an invite code so the join page can show the cohort name
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;

  const r = await ddb.send(new QueryCommand({
    TableName: TABLES.COHORTS,
    IndexName: "inviteCode-index",
    KeyConditionExpression: "inviteCode = :c",
    ExpressionAttributeValues: { ":c": code },
    Limit: 1,
  }));

  const cohort = r.Items?.[0] as Cohort | undefined;
  if (!cohort) {
    return NextResponse.json({ error: "INVALID_CODE" }, { status: 404 });
  }
  if (!cohort.signupOpen) {
    return NextResponse.json({ error: "SIGNUP_CLOSED", name: cohort.name }, { status: 403 });
  }
  return NextResponse.json({ name: cohort.name });
}
