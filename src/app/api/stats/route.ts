import { NextResponse, after } from "next/server";
import {
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
  GetCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import type { GradiAnalysis, ManagerRating, User, Video, JWTPayload } from "@/types";
import { processPendingQueue } from "@/lib/gradi";
import { extractYouTubeId } from "@/lib/utils";

const getApiKey = () => process.env.YOUTUBE_API_KEY ?? "";

function computeJuneCohortNetScore(videos: Video[], ratings: ManagerRating[]): number {
  const ratingMap = new Map<string, number>();
  for (const r of ratings) {
    if (r.managerId === "shared" || !ratingMap.has(r.videoId)) {
      ratingMap.set(r.videoId, r.total);
    }
  }

  const JUNE_WEEKS = [
    { start: new Date("2026-06-08T00:00:00Z"), end: new Date("2026-06-14T23:59:59Z") },
    { start: new Date("2026-06-15T00:00:00Z"), end: new Date("2026-06-21T23:59:59Z") },
    { start: new Date("2026-06-22T00:00:00Z"), end: new Date("2026-06-28T23:59:59Z") },
    { start: new Date("2026-06-29T00:00:00Z"), end: new Date("2026-07-05T23:59:59Z") },
  ];

  let totalScore = 0;
  JUNE_WEEKS.forEach((wk, wi) => {
    const wkVids = videos.filter(v => {
      if (!v.uploadedAt) return false;
      const d = new Date(v.uploadedAt);
      return d >= wk.start && d <= wk.end;
    });

    const wkScores = wkVids
      .map(v => ratingMap.get(v.videoId))
      .filter((s): s is number => s !== undefined && s !== null);

    wkScores.sort((a, b) => b - a);
    const limit = wi === 0 ? 1 : 3;
    const topSum = wkScores.slice(0, limit).reduce((sum, s) => sum + s, 0);
    totalScore += topSum;
  });
  return Number(totalScore.toFixed(2));
}

function parseYTDuration(dur: string): string {
  if (!dur) return "";
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = match?.[1] ? `${match[1]}:` : "";
  const m = match?.[2] || "0";
  const s = match?.[3]?.padStart(2, "0") || "00";
  return h ? `${h}${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function getWeekRange(week: string): { start: Date; end: Date } {
  const now = new Date();
  const currentStart = new Date(now);
  const day = currentStart.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  currentStart.setDate(currentStart.getDate() + diffToMonday);
  currentStart.setHours(0, 0, 0, 0);

  const currentEnd = new Date(currentStart);
  currentEnd.setDate(currentEnd.getDate() + 7);

  if (week === "previous") {
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 7);
    const previousEnd = new Date(currentStart);
    return { start: previousStart, end: previousEnd };
  }

  return { start: currentStart, end: now };
}

interface VideoStat {
  id: string;
  views: number;
  likes: number;
  channelId: string;
  duration: string;
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

async function fetchYouTubeChannelSubsBatch(channelIds: string[]) {
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

async function triggerBackgroundFacultyYTSync(facultyId: string, videos: Video[]) {
  after(async () => {
    try {
      console.log(`[Background YT Sync] Starting for faculty ${facultyId}`);
      const ytIdSet = new Set<string>();
      for (const v of videos) {
        const id = extractYouTubeId(v.youtubeUrl);
        if (id) ytIdSet.add(id);
      }
      const ytIds = Array.from(ytIdSet);
      if (ytIds.length === 0) return;

      const statsMap = new Map<string, { views: number; likes: number; channelId: string; duration: string }>();
      const BATCH_SIZE = 50;
      for (let i = 0; i < ytIds.length; i += BATCH_SIZE) {
        const batch = ytIds.slice(i, i + BATCH_SIZE);
        const results = await fetchYouTubeVideoStatsBatch(batch);
        results.forEach((r) => {
          statsMap.set(r.id, {
            views: r.views,
            likes: r.likes,
            channelId: r.channelId,
            duration: r.duration,
          });
        });
      }

      const currentCache = await getCachedYTStats(facultyId);

      const channelIds = [...new Set([...statsMap.values()].map(s => s.channelId).filter(Boolean))];
      if (channelIds.length === 0 && currentCache?.channelId) {
        channelIds.push(currentCache.channelId);
      }

      const channelSubsMap = new Map<string, number>();
      for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
        const batch = channelIds.slice(i, i + BATCH_SIZE);
        const results = await fetchYouTubeChannelSubsBatch(batch);
        Object.entries(results).forEach(([cid, subs]) => {
          channelSubsMap.set(cid, subs);
        });
      }

      let totalViews = 0;
      let totalLikes = 0;
      let channelId = "";

      for (const v of videos) {
        const ytId = extractYouTubeId(v.youtubeUrl);
        if (!ytId) continue;
        const s = ytId ? statsMap.get(ytId) : null;
        
        if (s) {
          totalViews += s.views;
          totalLikes += s.likes;
          if (!channelId && s.channelId) channelId = s.channelId;

          if (v.views !== s.views || v.likes !== s.likes || (!v.duration && s.duration)) {
            await ddb.send(new UpdateCommand({
              TableName: TABLES.VIDEOS,
              Key: { facultyId: v.facultyId, videoId: v.videoId },
              UpdateExpression: "SET #views = :v, likes = :l, #dur = :d",
              ExpressionAttributeNames: { "#views": "views", "#dur": "duration" },
              ExpressionAttributeValues: { ":v": s.views, ":l": s.likes, ":d": s.duration || v.duration || "" },
            })).catch(e => console.error(`[Background YT Sync] Video update failed ${v.videoId}:`, e));
          }
        } else {
          // Fall back to stats already stored on the video item in the DB
          totalViews += v.views ?? 0;
          totalLikes += v.likes ?? 0;
        }
      }

      if (!channelId && currentCache?.channelId) {
        channelId = currentCache.channelId;
      }
      
      let subscribers = channelId ? (channelSubsMap.get(channelId) ?? 0) : 0;
      if (subscribers === 0 && currentCache?.subscribers) {
        subscribers = currentCache.subscribers;
      }
      
      if (totalViews === 0 && currentCache?.totalViews) {
        totalViews = currentCache.totalViews;
      }
      if (totalLikes === 0 && currentCache?.totalLikes) {
        totalLikes = currentCache.totalLikes;
      }

      const syncedAt = new Date().toISOString();

      await ddb.send(new PutCommand({
        TableName: TABLES.YT_STATS,
        Item: { facultyId, totalViews, totalLikes, subscribers, channelId, syncedAt },
      }));
      console.log(`[Background YT Sync] Completed for faculty ${facultyId}. Views: ${totalViews}, Subs: ${subscribers}`);
    } catch (err) {
      console.error(`[Background YT Sync] Error for faculty ${facultyId}:`, err);
    }
  });
}


// ── Cached YT stats row shape ──────────────────────────────────────
interface YTStatsRow {
  facultyId: string;
  totalViews: number;
  totalLikes: number;
  subscribers: number;
  channelId?: string;
  syncedAt?: string;
}

// ── Self-healing: fill missing duration/thumbnail/title for videos ──
async function fetchYouTubeMetadata(youtubeUrl: string) {
  const ytId = extractYouTubeId(youtubeUrl);
  if (!ytId) return null;
  try {
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ytId}&key=${getApiKey()}`
    );
    if (!ytRes.ok) {
      let details = "";
      try {
        const errJson = await ytRes.json();
        details = `: ${JSON.stringify(errJson.error?.message || errJson)}`;
      } catch {}
      throw new Error(`YouTube API returned status ${ytRes.status}${details}`);
    }
    const ytData = await ytRes.json();
    if (!ytData.items?.length) {
      throw new Error("No items found in YouTube API response");
    }
    const item = ytData.items[0];
    const stats = item.statistics || {};
    const details = item.contentDetails || {};
    const snippet = item.snippet || {};

    const dur = details.duration || "";
    const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = match?.[1] ? `${match[1]}:` : "";
    const m = match?.[2] || "0";
    const s = match?.[3]?.padStart(2, "0") || "00";
    const duration = h ? `${h}${m.padStart(2, "0")}:${s}` : `${m}:${s}`;

    return {
      title: snippet.title || "",
      duration,
      thumbnailUrl:
        snippet.thumbnails?.maxres?.url ||
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.default?.url ||
        "",
      views: Number(stats.viewCount || 0),
      likes: Number(stats.likeCount || 0),
    };
  } catch (err) {
    console.error("fetchYouTubeMetadata error:", err);
    // Fallback to oEmbed + watch page scraping if YouTube API fails
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${ytId}`
      );
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        
        let duration = "";
        try {
          const watchRes = await fetch(`https://www.youtube.com/watch?v=${ytId}`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
            }
          });
          if (watchRes.ok) {
            const html = await watchRes.text();
            const match = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/);
            if (match) {
              const ms = Number(match[1]);
              const totalSeconds = Math.floor(ms / 1000);
              const hours = Math.floor(totalSeconds / 3600);
              const minutes = Math.floor((totalSeconds % 3600) / 60);
              const seconds = totalSeconds % 60;
              const hStr = hours > 0 ? `${hours}:` : "";
              const mStr = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
              const sStr = String(seconds).padStart(2, "0");
              duration = `${hStr}${mStr}:${sStr}`;
            }
          }
        } catch (scrapeErr) {
          console.error("fetchYouTubeMetadata scrape duration error:", scrapeErr);
        }

        return {
          title: oembedData.title || "",
          duration,
          thumbnailUrl: oembedData.thumbnail_url || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
          views: 0,
          likes: 0,
        };
      }
    } catch (oembedErr) {
      console.error("fetchYouTubeMetadata oEmbed fallback error:", oembedErr);
    }
    return null;
  }
}

function triggerSelfHealing(videos: Video[]) {
  const missing = videos.filter((v) => (!v.duration || !v.title || v.title === "Untitled Video") && v.youtubeUrl);
  if (missing.length === 0) return;
  after(async () => {
    try {
      console.log(
        `[Self-healing] ${missing.length} videos lacking details. Healing...`
      );
      for (const v of missing) {
        const metadata = await fetchYouTubeMetadata(v.youtubeUrl);
        if (metadata) {
          await ddb.send(
            new UpdateCommand({
              TableName: TABLES.VIDEOS,
              Key: { facultyId: v.facultyId, videoId: v.videoId },
              UpdateExpression:
                "SET #dur = :dur, thumbnailUrl = :thumb, #views = :views, likes = :likes, #title = :title",
              ExpressionAttributeNames: { "#dur": "duration", "#views": "views", "#title": "title" },
              ExpressionAttributeValues: {
                ":dur": metadata.duration || v.duration || "",
                ":thumb": metadata.thumbnailUrl || v.thumbnailUrl || "",
                ":views": metadata.views || v.views || 0,
                ":likes": metadata.likes || v.likes || 0,
                ":title": metadata.title || v.title || "Untitled Video",
              },
            })
          );
        }
      }
    } catch (err) {
      console.error("[Self-healing] Error:", err);
    }
  });
}

// ── Read cached per-faculty YT stats from fep-yt-stats ────────────
async function getCachedYTStats(facultyId: string): Promise<YTStatsRow | null> {
  try {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLES.YT_STATS, Key: { facultyId } })
    );
    return (res.Item as YTStatsRow) ?? null;
  } catch {
    return null;
  }
}

// ── Main GET — aggregate stats ─────────────────────────────────────
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  let facultyId = searchParams.get("facultyId") ?? user.userId;

  // Faculty: own stats only. Manager/Admin: any.
  if (user.role === "eduskill_faculty" && facultyId !== user.userId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // ── Stale userId guard: if the userId from JWT no longer exists in DB,
  // fall back to looking up the user by email. This handles the case where
  // a duplicate account was merged and the old userId was deleted.
  let facultyUser: User | undefined;
  const facultyUserRes = await ddb.send(
    new GetCommand({ TableName: TABLES.USERS, Key: { userId: facultyId } })
  );

  if (!facultyUserRes.Item && user.role === "eduskill_faculty") {
    // Try email-based lookup
    const { QueryCommand: QC } = await import("@aws-sdk/lib-dynamodb");
    const emailRes = await ddb.send(new QC({
      TableName: TABLES.USERS,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": user.email.toLowerCase().trim() },
      Limit: 1,
    }));
    const freshUser = emailRes.Items?.[0] as User | undefined;
    if (freshUser) {
      facultyId = freshUser.userId;
      facultyUser = freshUser;
      console.log(`[/api/stats] Resolved stale userId for ${user.email}: ${user.userId} → ${freshUser.userId}`);
    }
  } else {
    facultyUser = facultyUserRes.Item as User | undefined;
  }

  const week = searchParams.get("week") ?? "all";

  if (searchParams.get("scope") === "all") {
    return aggregateAll(
      searchParams.get("cohort") ?? "June EduSkill",
      user,
      week
    );
  }

  const videosRes = await ddb.send(
    new QueryCommand({
      TableName: TABLES.VIDEOS,
      KeyConditionExpression: "facultyId = :f",
      ExpressionAttributeValues: { ":f": facultyId },
    })
  );
  const videos = (videosRes.Items ?? []) as Video[];

  
  let filteredVideos = videos;
  if (week === "current" || week === "previous") {
    const { start, end } = getWeekRange(week);
    filteredVideos = videos.filter((v) => {
      if (!v.uploadedAt) return false;
      const d = new Date(v.uploadedAt);
      return d >= start && d < end;
    });
  }

  processPendingQueue();
  triggerSelfHealing(videos);

  // ── Read cached YouTube stats (synced hourly by /api/youtube-sync) ──
  const ytCache = await getCachedYTStats(facultyId);

  if (filteredVideos.length === 0) {
    return NextResponse.json({
      facultyId,
      facultyName: facultyUser?.name || "Unknown Faculty",
      facultyEmail: facultyUser?.email || "",
      cohort: facultyUser?.cohort || "June EduSkill",
      age: facultyUser?.age,
      dob: facultyUser?.dob,
      gender: (facultyUser as any)?.gender,
      teachingSubject: facultyUser?.teachingSubject,
      examTarget: facultyUser?.examTarget,
      subjects: facultyUser?.subjects || [],
      avatarUrl: facultyUser?.avatarUrl,
      totalVideos: 0,
      netScore: 0,
      pctRatedByManager: 0,
      totalViews: 0,
      totalLikes: 0,
      subscribers: ytCache?.subscribers || 0,
      ytStatsSyncedAt: ytCache?.syncedAt ?? null,
      bySubject: {},
      videos: [],
    });
  }

  let installs = 0;
  if (facultyUser?.cohort === "March EduSkill" && facultyUser.adjustToken) {
    try {
      const end = new Date();
      let start = new Date();
      start.setDate(start.getDate() - 30);
      let datePeriod = "";

      if (week === "current" || week === "previous") {
        const range = getWeekRange(week);
        start = range.start;
        datePeriod = `${start.toISOString().split("T")[0]}:${range.end.toISOString().split("T")[0]}`;
      } else {
        datePeriod = `${start.toISOString().split("T")[0]}:${end.toISOString().split("T")[0]}`;
      }

      const params = new URLSearchParams({
        dimensions: "network",
        metrics: "installs,clicks,sessions",
        date_period: datePeriod,
        tracker_token__in: facultyUser.adjustToken,
      });
      const res = await fetch(
        `https://dash.adjust.com/control-center/reports-service/report?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.ADJUST_API_TOKEN}`,
            Accept: "application/json",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const row = data.rows?.[0];
        if (row) {
          installs = Number(row.installs || 0);
        }
      }
    } catch (err) {
      console.error("Adjust API fetch error in single stats:", err);
    }
  }

  const isStale = !ytCache || !ytCache.syncedAt || 
    (new Date().getTime() - new Date(ytCache.syncedAt).getTime() > 1000 * 60 * 60 * 4);

  if (isStale && videos.length > 0) {
    triggerBackgroundFacultyYTSync(facultyId, videos);
  }

  // ── Fetch manager ratings for these videos ──────────────────────
  const ratings: ManagerRating[] = [];
  const videoIds = filteredVideos.map((v) => v.videoId);
  if (videoIds.length > 0) {
    const ratingPromises = videoIds.map((vId) =>
      ddb.send(
        new QueryCommand({
          TableName: TABLES.RATINGS,
          KeyConditionExpression: "videoId = :v",
          ExpressionAttributeValues: { ":v": vId },
        })
      ).catch((e) => {
        console.error(`Error querying ratings for ${vId}:`, e);
        return { Items: [] };
      })
    );
    const ratingResults = await Promise.all(ratingPromises);
    ratingResults.forEach((r) => {
      if (r.Items) {
        ratings.push(...(r.Items as ManagerRating[]));
      }
    });
  }
  const ratingMap = new Map<string, ManagerRating[]>();
  for (const r of ratings) {
    if (!ratingMap.has(r.videoId)) ratingMap.set(r.videoId, []);
    ratingMap.get(r.videoId)!.push(r);
  }
  const ratedCount = filteredVideos.filter((v) => v.status === "manager_rated").length;
  let netScore = 0;
  if (facultyUser?.cohort === "June EduSkill") {
    const simpleRatings: ManagerRating[] = [];
    for (const v of filteredVideos) {
      const vRatings = ratingMap.get(v.videoId) || [];
      const r = vRatings.find((rt) => rt.managerId === "shared") || vRatings[0];
      if (r) simpleRatings.push(r);
    }
    netScore = computeJuneCohortNetScore(filteredVideos, simpleRatings);
  } else {
    const managerScores = filteredVideos
      .map((v) => {
        const vRatings = ratingMap.get(v.videoId) || [];
        const r = vRatings.find((rt) => rt.managerId === "shared") || vRatings[0];
        return r ? r.total : null;
      })
      .filter((s): s is number => s !== null);
    const sumManager = managerScores.reduce((a, b) => a + b, 0);
    netScore = Number(sumManager.toFixed(2));
  }

  const bySubject: Record<
    string,
    { count: number; videos: Video[] }
  > = {};
  for (const v of filteredVideos) {
    const sid = v.subjectId || "unknown";
    if (!bySubject[sid]) bySubject[sid] = { count: 0, videos: [] };
    bySubject[sid].count++;
    bySubject[sid].videos.push(v);
  }

  return NextResponse.json({
    facultyId,
    facultyName: facultyUser?.name || "Unknown Faculty",
    facultyEmail: facultyUser?.email || "",
    cohort: facultyUser?.cohort || "June EduSkill",
    age: facultyUser?.age,
    dob: facultyUser?.dob,
    gender: (facultyUser as any)?.gender,
    teachingSubject: facultyUser?.teachingSubject,
    examTarget: facultyUser?.examTarget,
    subjects: facultyUser?.subjects || [],
    avatarUrl: facultyUser?.avatarUrl,
    totalVideos: filteredVideos.length,
    netScore,
    pctRatedByManager:
      filteredVideos.length > 0
        ? Math.round((ratedCount / filteredVideos.length) * 100)
        : 0,
    // ── YouTube aggregate stats (from hourly cache) ──
    totalViews: week === "all" ? (ytCache?.totalViews ?? 0) : filteredVideos.reduce((sum, v) => sum + (v.views ?? 0), 0),
    totalLikes: week === "all" ? (ytCache?.totalLikes ?? 0) : filteredVideos.reduce((sum, v) => sum + (v.likes ?? 0), 0),
    subscribers: ytCache?.subscribers || 0,
    ytStatsSyncedAt: ytCache?.syncedAt ?? null,
    bySubject,
    videos: filteredVideos.map((v) => {
      const vRatings = ratingMap.get(v.videoId) || [];
      const own = vRatings.find((r) => r.managerId === "shared") || vRatings[0];
      return {
        ...v,
        managerRating: own ?? null,
      };
    }),
  });
}

// ── aggregateAll — leaderboard / manager view ─────────────────────
async function aggregateAll(
  cohort: string = "June EduSkill",
  loggedInUser?: JWTPayload,
  week: string = "all"
) {
  // 1. Scan USERS to find faculty in the cohort (Scan is necessary as we have no index on cohort)
  const usersRes = await ddb.send(
    new ScanCommand({
      TableName: TABLES.USERS,
      FilterExpression: "#r = :r AND cohort = :c",
      ExpressionAttributeNames: { "#r": "role" },
      ExpressionAttributeValues: {
        ":r": "eduskill_faculty",
        ":c": cohort,
      },
    })
  );

  const users = (usersRes.Items ?? []) as User[];
  const facultyIds = users.map((u) => u.userId);

  // 2. Fetch all videos using a single ScanCommand (optimized to avoid N+1 queries)
  const videosRes = await ddb.send(new ScanCommand({ TableName: TABLES.VIDEOS }));
  const allVideos = (videosRes.Items ?? []) as Video[];
  const videos = allVideos.filter((v) => facultyIds.includes(v.facultyId));

  let filteredVideos = videos;
  if (week === "current" || week === "previous") {
    const { start, end } = getWeekRange(week);
    filteredVideos = videos.filter((v) => {
      if (!v.uploadedAt) return false;
      const d = new Date(v.uploadedAt);
      return d >= start && d < end;
    });
  }

  const videoIds = filteredVideos.map((v) => v.videoId);

  // 3. Fetch all ratings using a single ScanCommand (optimized to avoid N+1 queries)
  const ratings: ManagerRating[] = [];
  if (videoIds.length > 0) {
    const ratingsRes = await ddb.send(new ScanCommand({ TableName: TABLES.RATINGS }));
    const allRatings = (ratingsRes.Items ?? []) as ManagerRating[];
    ratings.push(...allRatings.filter((r) => videoIds.includes(r.videoId)));
  }

  // 4. BatchGet YT stats for the cohort's faculty
  const ytStatsRows: YTStatsRow[] = [];
  if (facultyIds.length > 0) {
    const keys = facultyIds.map((id) => ({ facultyId: id }));
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      const res = await ddb.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLES.YT_STATS]: { Keys: chunk },
          },
        })
      );
      if (res.Responses?.[TABLES.YT_STATS]) {
        ytStatsRows.push(...(res.Responses[TABLES.YT_STATS] as YTStatsRow[]));
      }
    }
  }

  processPendingQueue();
  triggerSelfHealing(videos);

  // ── Build YT stats lookup by facultyId ─────────────────────────
  const ytMap = new Map<string, YTStatsRow>(
    ytStatsRows.map((row) => [row.facultyId, row])
  );

  let leaderboard: unknown[] = [];

  if (cohort === "March EduSkill") {
    // Fetch from Adjust
    const tokens = users
      .filter((u) => u.adjustToken)
      .map((u) => u.adjustToken!);
    const adjustMap = new Map<
      string,
      { installs: number; clicks: number; sessions: number }
    >();
    users.forEach((u) => {
      adjustMap.set(u.email.toLowerCase().trim(), {
        installs: 0,
        clicks: 0,
        sessions: 0,
      });
    });

    if (tokens.length > 0 && process.env.ADJUST_API_TOKEN) {
      try {
        const end = new Date();
        let start = new Date();
        start.setDate(start.getDate() - 30);
        let datePeriod = "";

        if (week === "current" || week === "previous") {
          const range = getWeekRange(week);
          start = range.start;
          datePeriod = `${start.toISOString().split("T")[0]}:${range.end.toISOString().split("T")[0]}`;
        } else {
          datePeriod = `${start.toISOString().split("T")[0]}:${end.toISOString().split("T")[0]}`;
        }

        const params = new URLSearchParams({
          dimensions: "network",
          metrics: "installs,clicks,sessions",
          date_period: datePeriod,
        });
        params.set("tracker_token__in", tokens.join(","));
        const res = await fetch(
          `https://dash.adjust.com/control-center/reports-service/report?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.ADJUST_API_TOKEN}`,
              Accept: "application/json",
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const rows = data.rows ?? [];
          for (const row of rows) {
            const network = (
              (row.network as string) || ""
            ).toLowerCase();
            const matchingUser = users.find((u) =>
              network.includes(u.email.split("@")[0].toLowerCase())
            );
            if (matchingUser) {
              adjustMap.set(matchingUser.email.toLowerCase().trim(), {
                installs: Number(row.installs || 0),
                clicks: Number(row.clicks || 0),
                sessions: Number(row.sessions || 0),
              });
            }
          }
        }
      } catch (err) {
        console.error("Adjust API fetch error in stats aggregation:", err);
      }
    }

    leaderboard = users.map((u) => {
      const own = filteredVideos.filter((v) => v.facultyId === u.userId);
      const emailClean = u.email.toLowerCase().trim();
      const adjust = adjustMap.get(emailClean) ?? {
        installs: 0,
        clicks: 0,
        sessions: 0,
      };
      const yt = ytMap.get(u.userId);

      return {
        userId: u.userId,
        name: u.name,
        email: u.email,
        subjects: u.subjects,
        videoCount: own.length,
        installs: adjust.installs,
        views: week === "all" ? (yt?.totalViews ?? 0) : own.reduce((sum, v) => sum + (v.views ?? 0), 0),
        likes: week === "all" ? (yt?.totalLikes ?? 0) : own.reduce((sum, v) => sum + (v.likes ?? 0), 0),
        subscribersGained: yt?.subscribers || 0,
        avatarUrl: u.avatarUrl,
        ytStatsSyncedAt: yt?.syncedAt ?? null,
      };
    });
    (leaderboard as { installs: number }[]).sort(
      (a, b) => b.installs - a.installs
    );
  } else {
    leaderboard = users.map((u) => {
      const own = filteredVideos.filter((v) => v.facultyId === u.userId);
      const userRatings: ManagerRating[] = [];
      for (const v of own) {
        const vRatings = ratings.filter((rt) => rt.videoId === v.videoId);
        const r = vRatings.find((rt) => rt.managerId === "shared") || vRatings[0];
        if (r) userRatings.push(r);
      }

      const netScore = cohort === "June EduSkill"
        ? computeJuneCohortNetScore(own, userRatings)
        : Number(userRatings.reduce((sum, r) => sum + r.total, 0).toFixed(2));

      const yt = ytMap.get(u.userId);

      return {
        userId: u.userId,
        name: u.name,
        email: u.email,
        subjects: u.subjects,
        videoCount: own.length,
        netScore,
        totalViews: week === "all" ? (yt?.totalViews ?? 0) : own.reduce((sum, v) => sum + (v.views ?? 0), 0),
        totalLikes: week === "all" ? (yt?.totalLikes ?? 0) : own.reduce((sum, v) => sum + (v.likes ?? 0), 0),
        subscribers: yt?.subscribers ?? 0,
        ytStatsSyncedAt: yt?.syncedAt ?? null,
        avatarUrl: u.avatarUrl,
      };
    });
    (leaderboard as { netScore: number }[]).sort(
      (a, b) => b.netScore - a.netScore
    );
  }

  const subjectAgg = {};

  const videosWithScores = filteredVideos.map((v) => {
    const vRatings = ratings.filter((rt) => rt.videoId === v.videoId);
    const r = vRatings.find((rt) => rt.managerId === "shared") || vRatings[0];
    return {
      ...v,
      managerScore: r ? r.total : null,
      managerRating: r ?? null,
    };
  });

  return NextResponse.json({
    leaderboard,
    totalFaculty: users.length,
    totalVideos: filteredVideos.length,
    totalAnalyses: 0,
    totalRatings: ratings.length,
    subjectAgg,
    videos: videosWithScores,
  });
}
