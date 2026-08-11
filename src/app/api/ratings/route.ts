import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import type { ManagerRating, Video } from "@/types";

// POST — Manager submits/updates rating for a video (idempotent upsert)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (user.role !== "eduskill_manager" && user.role !== "eduskill_admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json();
  const {
    videoId,
    boardWork = 0,
    visualTLM = 0,
    energy = 0,
    delivery = 0,
    hook = 0,
    notes = "",
  } = body;

  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const bw = Number(boardWork);
  const vtlm = Number(visualTLM);
  const eng = Number(energy);
  const del = Number(delivery);
  const hk = Number(hook);
  const total = bw + vtlm + eng + del + hk;

  const rating: ManagerRating = {
    videoId,
    managerId: "shared",
    managerName: user.name,
    boardWork: bw,
    visualTLM: vtlm,
    energy: eng,
    delivery: del,
    hook: hk,
    total,
    notes,
    ratedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.RATINGS, Item: rating }));

  // Find owning faculty to update video status to manager_rated.
  // fep-videos has no GSI on videoId (composite key is facultyId+videoId),
  // so this must Scan — paginated so a truncated page can't drop the video.
  const videoItems = await scanAll({
    TableName: TABLES.VIDEOS,
    FilterExpression: "videoId = :v",
    ExpressionAttributeValues: { ":v": videoId },
  });
  const video = videoItems[0] as unknown as Video | undefined;
  if (video) {
    const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.VIDEOS,
        Key: { facultyId: video.facultyId, videoId },
        UpdateExpression: "SET #s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": "manager_rated" },
      })
    );
  }

  return NextResponse.json({ rating });
}
