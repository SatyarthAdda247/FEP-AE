import { NextResponse } from "next/server";
import { TABLES, scanAll } from "@/lib/dynamodb";
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

  const items = await scanAll({
    TableName: TABLES.USERS,
    FilterExpression: "#r = :f",
    ExpressionAttributeNames: { "#r": "role" },
    ExpressionAttributeValues: { ":f": "eduskill_faculty" },
  });

  let users = items as unknown as User[];
  if (cohort) users = users.filter(u => u.cohort === cohort);

  const submissions = users
    .map(u => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      phone: u.phone ?? "",
      cohort: u.cohort ?? "",
      addressLine1: u.addressLine1 ?? "",
      addressLine2: u.addressLine2 ?? "",
      city: u.city ?? "",
      state: u.state ?? "",
      pincode: u.pincode ?? "",
      backupPhone: u.backupPhone ?? "",
      dob: u.dob ?? "",
      gender: u.gender ?? "",
      tshirtSize: u.tshirtSize ?? "",
      profileComplete: u.profileComplete !== false, // legacy accounts have no flag = complete
      onboardedAt: u.onboardedAt ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ submissions });
}
