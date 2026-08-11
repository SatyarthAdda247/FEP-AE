import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { extractYouTubeId } from "@/lib/utils";
import { TABLES, scanAll } from "@/lib/dynamodb";

const getApiKey = () => process.env.YOUTUBE_API_KEY ?? "";

export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { videoId } = await ctx.params;

  // Get video from DB to get YouTube URL
  const items = await scanAll({
    TableName: TABLES.VIDEOS,
    FilterExpression: "videoId = :v",
    ExpressionAttributeValues: { ":v": videoId },
  });

  const video = items[0];
  if (!video?.youtubeUrl) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const ytId = extractYouTubeId(video.youtubeUrl as string);
  if (!ytId) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  try {
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ytId}&key=${getApiKey()}`
    );
    const ytData = await ytRes.json();

    if (!ytData.items?.length) {
      return NextResponse.json({ views: 0, likes: 0, comments: 0, duration: "", publishedAt: "" });
    }

    const item = ytData.items[0];
    const stats = item.statistics || {};
    const details = item.contentDetails || {};
    const snippet = item.snippet || {};

    // Parse ISO 8601 duration (PT1H2M3S)
    const dur = details.duration || "";
    const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = match?.[1] ? `${match[1]}:` : "";
    const m = match?.[2] || "0";
    const s = match?.[3]?.padStart(2, "0") || "00";
    const duration = h ? `${h}${m.padStart(2, "0")}:${s}` : `${m}:${s}`;

    return NextResponse.json({
      views: Number(stats.viewCount || 0),
      likes: Number(stats.likeCount || 0),
      comments: Number(stats.commentCount || 0),
      duration,
      publishedAt: snippet.publishedAt || "",
    });
  } catch (err) {
    console.error("YouTube API error:", err);
    return NextResponse.json({ views: 0, likes: 0, comments: 0, duration: "", publishedAt: "" });
  }
}
