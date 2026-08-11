import { NextResponse } from "next/server";
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { extractYouTubeId } from "@/lib/utils";
import type { Video } from "@/types";

const getApiKey = () => process.env.YOUTUBE_API_KEY ?? "";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET — called by Vercel Cron every hour (secured by CRON_SECRET)
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSync();
}

// POST — also callable manually
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSync();
}

interface VideoStat { views: number; likes: number; channelId: string; duration: string }

function parseYTDuration(dur: string): string {
  if (!dur) return "";
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = match?.[1] ? `${match[1]}:` : "";
  const m = match?.[2] || "0";
  const s = match?.[3]?.padStart(2, "0") || "00";
  return h ? `${h}${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
}

async function fetchYouTubeVideoStatsBatch(ytIds: string[]): Promise<VideoStat[]> {
  if (ytIds.length === 0) return [];
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ytIds.join(",")}&key=${getApiKey()}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: any) => ({
      id: item.id,
      views: Number(item.statistics?.viewCount ?? 0),
      likes: Number(item.statistics?.likeCount ?? 0),
      channelId: item.snippet?.channelId ?? "",
      duration: parseYTDuration(item.contentDetails?.duration ?? ""),
    }));
  } catch (err) {
    console.error("fetchYouTubeVideoStatsBatch error:", err);
    return [];
  }
}

async function fetchYouTubeChannelSubsBatch(channelIds: string[]): Promise<Record<string, number>> {
  if (channelIds.length === 0) return {};
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds.join(",")}&key=${getApiKey()}`
    );
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, number> = {};
    (data.items ?? []).forEach((item: any) => {
      map[item.id] = Number(item.statistics?.subscriberCount ?? 0);
    });
    return map;
  } catch (err) {
    console.error("fetchYouTubeChannelSubsBatch error:", err);
    return {};
  }
}

async function runSync() {
  const startedAt = new Date().toISOString();
  console.log(`[YT Sync] Starting via GCP YouTube API at ${startedAt}`);

  try {
    // 1. Load all videos (paginated — a single Scan page silently
    // truncates past DynamoDB's 1MB limit, and this table has 1500+ rows)
    const videos = await scanAll({ TableName: TABLES.VIDEOS }) as unknown as Video[];
    console.log(`[YT Sync] ${videos.length} total videos`);

    // 2. Unique YouTube IDs
    const ytIdSet = new Set<string>();
    for (const v of videos) {
      const id = extractYouTubeId(v.youtubeUrl);
      if (id) ytIdSet.add(id);
    }
    const ytIds = Array.from(ytIdSet);
    console.log(`[YT Sync] ${ytIds.length} unique YouTube IDs`);

    // 3. Fetch video stats (batch size 50)
    const statsMap = new Map<string, VideoStat>();
    const BATCH_SIZE = 50;
    for (let i = 0; i < ytIds.length; i += BATCH_SIZE) {
      const batch = ytIds.slice(i, i + BATCH_SIZE);
      const results = await fetchYouTubeVideoStatsBatch(batch);
      results.forEach((r: any) => {
        statsMap.set(r.id, r);
      });
    }
    console.log(`[YT Sync] Got stats for ${statsMap.size}/${ytIds.length} videos`);

    // Load existing cached stats to prevent overwriting with 0/empty
    const existingCaches = await scanAll({ TableName: TABLES.YT_STATS }) as Record<string, any>[];
    const cacheMap = new Map<string, any>(existingCaches.map(c => [c.facultyId, c]));

    // 4. Channel subscriber counts (batch size 50)
    const channelIdsFromStats = [...new Set([...statsMap.values()].map(s => s.channelId).filter(Boolean))];
    const channelIdsFromCache: string[] = [...new Set(existingCaches.map(c => c.channelId).filter(Boolean))];
    const channelIds = [...new Set([...channelIdsFromStats, ...channelIdsFromCache])];

    const channelSubsMap = new Map<string, number>();
    for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
      const batch = channelIds.slice(i, i + BATCH_SIZE);
      const results = await fetchYouTubeChannelSubsBatch(batch);
      Object.entries(results).forEach(([cid, subs]) => {
        channelSubsMap.set(cid, subs);
      });
    }

    // 5. Group by faculty
    const byFaculty = new Map<string, Video[]>();
    for (const v of videos) {
      if (!byFaculty.has(v.facultyId)) byFaculty.set(v.facultyId, []);
      byFaculty.get(v.facultyId)!.push(v);
    }

    // 6. Write per-faculty aggregates + update individual videos
    const syncedAt = new Date().toISOString();
    let facultiesSynced = 0;
    let videosUpdated = 0;

    for (const [facultyId, fVideos] of byFaculty) {
      let totalViews = 0;
      let totalLikes = 0;
      let channelId = "";
      const existing = cacheMap.get(facultyId);

      for (const v of fVideos) {
        const ytId = extractYouTubeId(v.youtubeUrl);
        if (!ytId) continue;
        const s = statsMap.get(ytId);
        if (!s) {
          // Fall back to stats already stored on the video item in the DB
          totalViews += v.views ?? 0;
          totalLikes += v.likes ?? 0;
          continue;
        }

        totalViews += s.views;
        totalLikes += s.likes;
        if (!channelId && s.channelId) channelId = s.channelId;

        // Update individual video record
        if (v.views !== s.views || v.likes !== s.likes || (!v.duration && s.duration)) {
          ddb.send(new UpdateCommand({
            TableName: TABLES.VIDEOS,
            Key: { facultyId: v.facultyId, videoId: v.videoId },
            UpdateExpression: "SET #views = :v, likes = :l, #dur = :d",
            ExpressionAttributeNames: { "#views": "views", "#dur": "duration" },
            ExpressionAttributeValues: { ":v": s.views, ":l": s.likes, ":d": s.duration || v.duration || "" },
          })).catch(e => console.error(`[YT Sync] video update failed ${v.videoId}:`, e));
          videosUpdated++;
        }
      }

      if (!channelId && existing?.channelId) {
        channelId = existing.channelId;
      }

      let subscribers = channelId ? (channelSubsMap.get(channelId) ?? 0) : 0;
      if (subscribers === 0 && existing?.subscribers) {
        subscribers = existing.subscribers;
      }

      if (totalViews === 0 && existing?.totalViews) {
        totalViews = existing.totalViews;
      }
      if (totalLikes === 0 && existing?.totalLikes) {
        totalLikes = existing.totalLikes;
      }

      await ddb.send(new PutCommand({
        TableName: TABLES.YT_STATS,
        Item: { facultyId, totalViews, totalLikes, subscribers, channelId, syncedAt },
      }));
      facultiesSynced++;
    }

    console.log(`[YT Sync] Done. ${facultiesSynced} faculties, ${videosUpdated} videos updated.`);
    return NextResponse.json({
      ok: true, syncedAt,
      totalVideos: videos.length, uniqueYtIds: ytIds.length,
      facultiesSynced, videosUpdated,
    });
  } catch (err) {
    console.error("[YT Sync] Fatal:", err);
    return NextResponse.json({ error: "Sync failed", details: String(err) }, { status: 500 });
  }
}
