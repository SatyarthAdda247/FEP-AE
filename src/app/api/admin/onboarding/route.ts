import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import type { User } from "@/types";

// GET ?cohort= — every faculty profile, with onboarding-form status/fields.
// Read-only for manager/admin/viewer; this is the "archive" of submitted
// onboarding data and backs the CSV export in the admin console.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "eduskill_faculty") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cohort = searchParams.get("cohort");

  // A single Scan page caps at 1MB, which silently truncates fep-users
  // (375+ rows) well before this filter runs — page through all of it so
  // the export can't quietly drop candidates.
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: TABLES.USERS,
      FilterExpression: "#r = :f",
      ExpressionAttributeNames: { "#r": "role" },
      ExpressionAttributeValues: { ":f": "eduskill_faculty" },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  let users = items as unknown as User[];
  if (cohort) users = users.filter(u => u.cohort === cohort);

  const submissions = users
    .map(u => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      phone: u.phone ?? "",
      cohort: u.cohort ?? "",
      address: u.address ?? "",
      age: u.age ?? "",
      gender: u.gender ?? "",
      tshirtSize: u.tshirtSize ?? "",
      profileComplete: u.profileComplete !== false, // legacy accounts have no flag = complete
      onboardedAt: u.onboardedAt ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ submissions });
}
