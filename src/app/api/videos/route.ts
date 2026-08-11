import { NextResponse, after } from "next/server";
import { v4 as uuid } from "uuid";
import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";
import { getCurrentUser } from "@/lib/auth";
import { extractYouTubeId, youtubeThumb } from "@/lib/utils";
import { analyzeWithGradi, processPendingQueue, hasYouTubeTranscript } from "@/lib/gradi";
import type { Video, ManagerRating } from "@/types";

async function attachRatings(videos: Video[]): Promise<(Video & { managerRating: ManagerRating | null })[]> {
  if (videos.length === 0) return [];
  const videoIds = videos.map((v) => v.videoId);
  
  let ratings: ManagerRating[] = [];
  if (videoIds.length > 10) {
    const allRatings = await scanAll({ TableName: TABLES.RATINGS }) as unknown as ManagerRating[];
    ratings = allRatings.filter((r) => videoIds.includes(r.videoId));
  } else {
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

  const ratingsMap = new Map<string, ManagerRating>();
  for (const r of ratings) {
    if (r.managerId === "shared" || !ratingsMap.has(r.videoId)) {
      ratingsMap.set(r.videoId, r);
    }
  }

  return videos.map((v) => ({
    ...v,
    managerRating: ratingsMap.get(v.videoId) ?? null,
  }));
}

// GET — list videos. Faculty: own only. Manager: all (filterable).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const facultyId = searchParams.get("facultyId");
  const subjectId = searchParams.get("subjectId");

  if (user.role === "eduskill_faculty") {
    const r = await ddb.send(
      new QueryCommand({
        TableName: TABLES.VIDEOS,
        KeyConditionExpression: "facultyId = :f",
        ExpressionAttributeValues: { ":f": user.userId },
      })
    );
    const videos = r.Items ?? [];
    const videosWithRatings = await attachRatings(videos as Video[]);
    processPendingQueue();
    return NextResponse.json({ videos: videosWithRatings });
  }

  // Manager
  if (facultyId) {
    const r = await ddb.send(
      new QueryCommand({
        TableName: TABLES.VIDEOS,
        KeyConditionExpression: "facultyId = :f",
        ExpressionAttributeValues: { ":f": facultyId },
      })
    );
    const videos = r.Items ?? [];
    const videosWithRatings = await attachRatings(videos as Video[]);
    processPendingQueue();
    return NextResponse.json({ videos: videosWithRatings });
  }
  if (subjectId) {
    const r = await ddb.send(
      new QueryCommand({
        TableName: TABLES.VIDEOS,
        IndexName: "subjectId-uploadedAt-index",
        KeyConditionExpression: "subjectId = :s",
        ExpressionAttributeValues: { ":s": subjectId },
        ScanIndexForward: false,
      })
    );
    const videos = r.Items ?? [];
    const videosWithRatings = await attachRatings(videos as Video[]);
    processPendingQueue();
    return NextResponse.json({ videos: videosWithRatings });
  }

  const videos = await scanAll({ TableName: TABLES.VIDEOS });
  const videosWithRatings = await attachRatings(videos as unknown as Video[]);
  processPendingQueue();
  return NextResponse.json({ videos: videosWithRatings });
}

// POST — Upload a video link (faculty for themselves, or manager on behalf of a faculty)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { youtubeUrl, subjectId, subject, title, facultyId: assignToFacultyId } = body;

  // Determine target faculty
  let targetFacultyId = user.userId;
  let targetFacultyName = user.name;

  if (user.role === "eduskill_manager" || user.role === "eduskill_admin") {
    // Manager can assign to any faculty
    if (assignToFacultyId) {
      targetFacultyId = assignToFacultyId;
      // Look up name (optional optimization — skip if not critical)
      targetFacultyName = body.facultyName ?? assignToFacultyId;
    } else {
      return NextResponse.json(
        { error: "Manager must specify facultyId to assign the video" },
        { status: 400 }
      );
    }
  } else if (user.role !== "eduskill_faculty") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!youtubeUrl) {
    return NextResponse.json(
      { error: "youtubeUrl required" },
      { status: 400 }
    );
  }
  const newYtId = extractYouTubeId(youtubeUrl);
  if (!newYtId) {
    return NextResponse.json(
      { error: "Invalid YouTube URL" },
      { status: 400 }
    );
  }

  // Prevent uploading the same video twice
  const existingVideos = await scanAll({
    TableName: TABLES.VIDEOS,
    ProjectionExpression: "youtubeUrl",
  }) as unknown as { youtubeUrl: string }[];
  const isDuplicate = existingVideos.some((v) => {
    const existingId = extractYouTubeId(v.youtubeUrl);
    return existingId === newYtId;
  });

  if (isDuplicate) {
    return NextResponse.json(
      { error: "This video has already been uploaded." },
      { status: 400 }
    );
  }

  // Auto-assign subject from faculty's profile if not provided
  let resolvedSubjectId = subjectId || "";
  let resolvedSubject = subject || "";
  let resolvedTitle = title || "Untitled Video";

  if (!resolvedSubjectId) {
    // Look up faculty's subjects from their user profile
    const userRes = await ddb.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId: targetFacultyId } }));
    const facultyUser = userRes.Item;
    if (facultyUser) {
      if (!targetFacultyName || targetFacultyName === targetFacultyId) {
        targetFacultyName = (facultyUser.name as string) ?? targetFacultyId;
      }
      const userSubjects = (facultyUser.subjects as string[]) ?? [];
      if (userSubjects.length > 0) {
        resolvedSubjectId = userSubjects[0];
        resolvedSubject = resolvedSubjectId;
      }
      // Fallback: infer from examTarget/teachingSubject
      if (!resolvedSubjectId) {
        const examTarget = ((facultyUser.examTarget as string) ?? "").toLowerCase();
        const teachingSub = ((facultyUser.teachingSubject as string) ?? "").toLowerCase();
        const combined = examTarget + " " + teachingSub;
        if (combined.includes("ssc") || combined.includes("one day")) resolvedSubjectId = "ssc";
        else if (combined.includes("neet") || combined.includes("biology") || combined.includes("zoology")) resolvedSubjectId = "neet";
        else if (combined.includes("banking") || combined.includes("bank") || combined.includes("insurance")) resolvedSubjectId = "banking";
        else if (combined.includes("upsc") || combined.includes("psc") || combined.includes("civil service")) resolvedSubjectId = "upsc";
        else if (combined.includes("railway") || combined.includes("rrb")) resolvedSubjectId = "railway";
        else if (combined.includes("cuet")) resolvedSubjectId = "cuet";
        else if (combined.includes("ugc") || combined.includes("net")) resolvedSubjectId = "ugc-net";
        else if (combined.includes("teaching") || combined.includes("ctet") || combined.includes("tet") || combined.includes("cdp")) resolvedSubjectId = "teaching";
        else if (combined.includes("nursing")) resolvedSubjectId = "nursing";
        else if (combined.includes("gate") || combined.includes("engineering") || combined.includes("iti") || combined.includes("jee")) resolvedSubjectId = "tech";
        else if (combined.includes("foundation") || combined.includes("class") || combined.includes("academic") || combined.includes("board")) resolvedSubjectId = "foundation";
        else resolvedSubjectId = "ssc"; // default fallback
        resolvedSubject = resolvedSubjectId;
    }
  }
}
const getApiKey = () => process.env.YOUTUBE_API_KEY ?? "";

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
        thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || "",
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

  const standardizedUrl = `https://www.youtube.com/watch?v=${newYtId}`;

  // Fetch YouTube metadata
  const ytMetadata = await fetchYouTubeMetadata(standardizedUrl);
  if (ytMetadata) {
    if (!title || title === "Untitled Video") {
      resolvedTitle = ytMetadata.title;
    }
  }

  const videoId = uuid();
  const hasTranscript = await hasYouTubeTranscript(newYtId);

  const video: Video = {
    facultyId: targetFacultyId,
    facultyName: targetFacultyName,
    videoId,
    youtubeUrl: standardizedUrl,
    subject: resolvedSubject ?? resolvedSubjectId,
    subjectId: resolvedSubjectId,
    title: resolvedTitle,
    thumbnailUrl: ytMetadata?.thumbnailUrl || youtubeThumb(standardizedUrl) || undefined,
    duration: ytMetadata?.duration || undefined,
    views: ytMetadata?.views || 0,
    likes: ytMetadata?.likes || 0,
    uploadedAt: new Date().toISOString(),
    status: hasTranscript ? "analyzing" : "no_transcript",
  };

  await ddb.send(new PutCommand({ TableName: TABLES.VIDEOS, Item: video }));

  if (hasTranscript) {
    // Schedule Gradi analysis to run AFTER the response is sent.
    // `after()` works on Vercel (the runtime keeps the function alive) and locally.
    after(async () => {
      try {
        const analysis = await analyzeWithGradi(standardizedUrl, videoId);
        await ddb.send(
          new PutCommand({ TableName: TABLES.ANALYSES, Item: analysis })
        );
        await ddb.send(
          new UpdateCommand({
            TableName: TABLES.VIDEOS,
            Key: { facultyId: targetFacultyId, videoId },
            UpdateExpression: "SET #s = :s",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": "gradi_done" },
          })
        );
      } catch (e: any) {
        console.error("Gradi analysis failed for", videoId, e);
        const errorMsg = e?.message || "";
        const statusVal = errorMsg.toLowerCase().includes("transcript") || errorMsg.includes("analysis") ? "no_transcript" : "no_transcript";
        await ddb.send(
          new UpdateCommand({
            TableName: TABLES.VIDEOS,
            Key: { facultyId: targetFacultyId, videoId },
            UpdateExpression: "SET #s = :s",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": statusVal },
          })
        ).catch(() => {});
      }
    });
  }

  return NextResponse.json({ video });
}
