import { NextResponse } from "next/server";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import type { GradiAnalysis, ManagerRating, Video } from "@/types";

// GET — full video detail (video + analysis + manager ratings)
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ videoId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { videoId } = await ctx.params;

  // Find the video — scan via Query if faculty, else scan all (small dataset)
  let video: Video | undefined;
  if (user.role === "eduskill_faculty") {
    const r = await ddb.send(
      new QueryCommand({
        TableName: TABLES.VIDEOS,
        KeyConditionExpression: "facultyId = :f AND videoId = :v",
        ExpressionAttributeValues: { ":f": user.userId, ":v": videoId },
      })
    );
    video = r.Items?.[0] as Video | undefined;
  } else {
    const items = await scanAll({
      TableName: TABLES.VIDEOS,
      FilterExpression: "videoId = :v",
      ExpressionAttributeValues: { ":v": videoId },
    });
    video = items[0] as unknown as Video | undefined;
  }

  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [analysisRes, ratingsRes] = await Promise.all([
    ddb.send(new GetCommand({ TableName: TABLES.ANALYSES, Key: { videoId } })),
    ddb.send(
      new QueryCommand({
        TableName: TABLES.RATINGS,
        KeyConditionExpression: "videoId = :v",
        ExpressionAttributeValues: { ":v": videoId },
      })
    ),
  ]);

  return NextResponse.json({
    video,
    analysis: (analysisRes.Item ?? null) as GradiAnalysis | null,
    managerRatings: ((ratingsRes.Items ?? []) as ManagerRating[]).sort((a, b) => b.total - a.total),
  });
}

// DELETE — Delete a video (and its analysis + ratings)
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ videoId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { videoId } = await ctx.params;

  // 1. Find the video to get its facultyId
  const scanItems = await scanAll({
    TableName: TABLES.VIDEOS,
    FilterExpression: "videoId = :v",
    ExpressionAttributeValues: { ":v": videoId },
  });

  const video = scanItems[0] as unknown as Video | undefined;
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (user.role === "eduskill_viewer") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  // Faculty can only delete their own videos. Managers/admins can delete any.
  if (user.role === "eduskill_faculty" && video.facultyId !== user.userId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");

  // 2. Delete the video item (composite key)
  await ddb.send(
    new DeleteCommand({
      TableName: TABLES.VIDEOS,
      Key: { facultyId: video.facultyId, videoId },
    })
  );

  // 3. Delete from fep-gradi-analyses (simple key)
  await ddb.send(
    new DeleteCommand({
      TableName: TABLES.ANALYSES,
      Key: { videoId },
    })
  );

  // 4. Delete from fep-manager-ratings (composite key, query & delete each)
  const ratingsRes = await ddb.send(
    new QueryCommand({
      TableName: TABLES.RATINGS,
      KeyConditionExpression: "videoId = :v",
      ExpressionAttributeValues: { ":v": videoId },
    })
  );

  const ratingsList = (ratingsRes.Items ?? []) as ManagerRating[];
  for (const rating of ratingsList) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.RATINGS,
        Key: { videoId, managerId: rating.managerId },
      })
    );
  }

  return NextResponse.json({ success: true, message: "Video deleted successfully" });
}

// POST — Trigger manual Gradi analysis for a video
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ videoId: string }> }
) {
  const { after } = await import("next/server");
  const { analyzeWithGradi } = await import("@/lib/gradi");
  const { PutCommand, UpdateCommand } = await import("@aws-sdk/lib-dynamodb");

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (user.role === "eduskill_viewer") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { videoId } = await ctx.params;

  // 1. Find the video to get its youtubeUrl and facultyId
  const scanItems = await scanAll({
    TableName: TABLES.VIDEOS,
    FilterExpression: "videoId = :v",
    ExpressionAttributeValues: { ":v": videoId },
  });

  const video = scanItems[0] as unknown as Video | undefined;
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // Update status to analyzing
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.VIDEOS,
      Key: { facultyId: video.facultyId, videoId },
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "analyzing" },
    })
  );

  // Trigger analysis in background
  after(async () => {
    try {
      const analysis = await analyzeWithGradi(video.youtubeUrl, videoId);
      await ddb.send(
        new PutCommand({ TableName: TABLES.ANALYSES, Item: analysis })
      );
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.VIDEOS,
          Key: { facultyId: video.facultyId, videoId },
          UpdateExpression: "SET #s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": "gradi_done" },
        })
      );
    } catch (e: any) {
      console.error("Manual Gradi analysis failed for", videoId, e);
      const errorMsg = e?.message || "";
      const statusVal = errorMsg.toLowerCase().includes("transcript") || errorMsg.includes("analysis") ? "no_transcript" : "no_transcript";
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.VIDEOS,
          Key: { facultyId: video.facultyId, videoId },
          UpdateExpression: "SET #s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": statusVal },
        })
      ).catch(() => {});
    }
  });

  return NextResponse.json({ success: true, message: "Analysis triggered" });
}


