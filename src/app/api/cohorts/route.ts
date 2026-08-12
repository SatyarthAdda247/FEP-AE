import { NextResponse } from "next/server";
import { TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import type { Cohort, User } from "@/types";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "eduskill_manager" && user.role !== "eduskill_admin" && user.role !== "eduskill_viewer")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cohort = searchParams.get("cohort");

  const [userItems, cohortItems] = await Promise.all([
    scanAll({
      TableName: TABLES.USERS,
      FilterExpression: "#r = :f OR (#r = :m AND cohort = :march)",
      ExpressionAttributeNames: { "#r": "role" },
      ExpressionAttributeValues: {
        ":f": "eduskill_faculty",
        ":m": "eduskill_manager",
        ":march": "March EduSkill"
      },
    }),
    scanAll({ TableName: TABLES.COHORTS }),
  ]);

  const allFaculty = userItems as unknown as User[];

  // Get unique cohorts — include registered cohorts (fep-cohorts) so a
  // freshly created cohort shows up even before anyone has joined it.
  const cohortSet = new Set<string>();
  for (const f of allFaculty) {
    if (f.cohort) cohortSet.add(f.cohort);
  }
  for (const c of cohortItems as unknown as Cohort[]) {
    cohortSet.add(c.name);
  }

  // Filter by cohort if specified
  const filtered = cohort 
    ? allFaculty.filter(f => f.cohort === cohort)
    : allFaculty;

  return NextResponse.json({
    cohorts: Array.from(cohortSet).sort(),
    faculty: filtered.map(f => ({
      userId: f.userId,
      name: f.name,
      email: f.email,
      cohort: f.cohort ?? "Unassigned",
      adjustToken: f.adjustToken ?? null,
      trackingLink: f.trackingLink ?? null,
    })),
    total: filtered.length,
  });
}
