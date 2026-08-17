import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import { requireRole } from "@/lib/auth";

const requireAdminOrManager = () => requireRole(["eduskill_admin", "eduskill_manager"]);

// POST — Approve or Reject a profile edit access request
export async function POST(req: Request) {
  const admin = await requireAdminOrManager();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { requestId, action } = body;
  if (!requestId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "requestId and valid action ('approve'|'reject') required" }, { status: 400 });
  }

  const newStatus = action === "approve" ? "granted" : "none";
  const now = new Date().toISOString();

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: requestId },
        UpdateExpression: "SET editPermissionStatus = :eps, editReviewedAt = :era, editReviewedBy = :erb",
        ExpressionAttributeValues: {
          ":eps": newStatus,
          ":era": now,
          ":erb": admin.name || admin.email,
        },
      })
    );

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "Editing rights granted to user" : "Editing rights request rejected",
    });
  } catch (err: any) {
    console.error("Error updating profile permission:", err);
    return NextResponse.json({ error: err.message || "Failed to update permission" }, { status: 500 });
  }
}
