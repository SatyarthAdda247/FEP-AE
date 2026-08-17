import { NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import { requireRole } from "@/lib/auth";
import type { ProfileEditRequestItem } from "../route";

const requireAdminOrManager = () => requireRole(["eduskill_admin", "eduskill_manager"]);

// POST — Approve or Reject a profile update request
export async function POST(req: Request) {
  const admin = await requireAdminOrManager();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { requestId, action } = await req.json();
  if (!requestId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "requestId and valid action ('approve'|'reject') required" }, { status: 400 });
  }

  // Fetch request details
  const reqRes = await ddb.send(
    new GetCommand({ TableName: TABLES.PROFILE_REQUESTS, Key: { requestId } })
  );
  const request = reqRes.Item as ProfileEditRequestItem | undefined;
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (request.status !== "pending") {
    return NextResponse.json({ error: `Request has already been ${request.status}` }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (action === "approve") {
    // Apply changes to the target user record in fep-users
    const changes = request.changes ?? {};
    if (Object.keys(changes).length > 0) {
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
          Key: { userId: request.userId },
          UpdateExpression: `SET ${updateParts.join(", ")}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
      );
    }

    // Mark request as approved
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.PROFILE_REQUESTS,
        Key: { requestId },
        UpdateExpression: "SET #status = :s, #reviewedAt = :ra, #reviewedBy = :rb",
        ExpressionAttributeNames: {
          "#status": "status",
          "#reviewedAt": "reviewedAt",
          "#reviewedBy": "reviewedBy",
        },
        ExpressionAttributeValues: {
          ":s": "approved",
          ":ra": now,
          ":rb": admin.name || admin.email,
        },
      })
    );

    return NextResponse.json({ success: true, message: "Profile update request approved and applied" });
  }

  // If reject
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.PROFILE_REQUESTS,
      Key: { requestId },
      UpdateExpression: "SET #status = :s, #reviewedAt = :ra, #reviewedBy = :rb",
      ExpressionAttributeNames: {
        "#status": "status",
        "#reviewedAt": "reviewedAt",
        "#reviewedBy": "reviewedBy",
      },
      ExpressionAttributeValues: {
        ":s": "rejected",
        ":ra": now,
        ":rb": admin.name || admin.email,
      },
    })
  );

  return NextResponse.json({ success: true, message: "Profile update request rejected" });
}
