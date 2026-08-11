import { config } from "dotenv";
config({ path: ".env.local" });

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  }),
  { marshallOptions: { removeUndefinedValues: true } }
);

const GRADI_URL = process.env.GRADI_API_URL || "https://gradi.ai/api/analyze-video";
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YT_API_KEY) { throw new Error("Set YOUTUBE_API_KEY in .env.local before running this script"); }

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // If it's already a raw 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m && m[1]) return m[1];
  }

  const fallbackPattern = /(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/;
  const fallbackMatch = trimmed.match(fallbackPattern);
  if (fallbackMatch && fallbackMatch[1]) return fallbackMatch[1];

  return null;
}

function parseYTDuration(dur: string): string {
  if (!dur) return "";
  const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = match?.[1] ? `${match[1]}:` : "";
  const m = match?.[2] || "0";
  const s = match?.[3]?.padStart(2, "0") || "00";
  return h ? `${h}${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
}

async function fetchYouTubeMetadata(ytId: string): Promise<any> {
  try {
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ytId}&key=${YT_API_KEY}`
    );
    if (!ytRes.ok) {
      throw new Error(`YouTube API returned status ${ytRes.status}`);
    }
    const ytData = await ytRes.json();
    if (!ytData.items?.length) {
      throw new Error("No items found in YouTube API response");
    }
    const item = ytData.items[0];
    const stats = item.statistics || {};
    const details = item.contentDetails || {};
    const snippet = item.snippet || {};

    return {
      title: snippet.title || "",
      duration: parseYTDuration(details.duration || ""),
      thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || "",
      views: Number(stats.viewCount || 0),
      likes: Number(stats.likeCount || 0),
    };
  } catch (err: any) {
    console.log(`[YouTube API Failed] ${ytId}: ${err.message}. Falling back to oEmbed...`);
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${ytId}`
      );
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        return {
          title: oembedData.title || "",
          duration: "",
          thumbnailUrl: oembedData.thumbnail_url || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
          views: 0,
          likes: 0,
        };
      }
    } catch (oembedErr: any) {
      console.error(`[oEmbed Failed] ${ytId}:`, oembedErr.message);
    }
    return null;
  }
}

async function analyzeWithGradi(cleanUrl: string, videoId: string): Promise<any> {
  const res = await fetch(GRADI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      youtube_url: cleanUrl,
      analysis_language: "hinglish",
      category: null,
    }),
  });

  if (!res.ok) {
    throw new Error(`Gradi API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const a = json?.data?.analysis;
  if (!a) throw new Error("Gradi: missing analysis in response");

  const r = a.ratings || {};
  const get = (k: string) => Number(r[k]?.score ?? 0);

  return {
    videoId,
    gradiScore: Number(a.gradi_score?.score ?? 0),
    scoreReason: a.gradi_score?.reason ?? "",
    oneLiner: a.one_liner ?? "",
    summary: a.summary ?? "",
    positives: a.positives ?? [],
    improvements: a.areas_of_improvement ?? [],
    ratingClarity: get("Clarity of Content"),
    ratingDepth: get("Content Depth"),
    ratingStructure: get("Content Structure"),
    ratingCommunication: get("Communication Effectiveness"),
    ratingInteraction: get("Student Interaction"),
    ratingCommercial: get("Commercial Balance"),
    videoMetadata: json.data?.video_metadata,
    analyzedAt: json.data?.timestamp ?? new Date().toISOString(),
  };
}

async function run() {
  try {
    console.log("=== HEALING AND RETRYING ALL VIDEOS IN DATABASE ===");
    console.log("1. Scanning all videos in fep-videos...");
    const videosRes = await ddb.send(new ScanCommand({ TableName: "fep-videos" }));
    const videos = videosRes.Items ?? [];
    console.log(`Found ${videos.length} videos.`);

    console.log("2. Scanning all completed analyses...");
    const analysesRes = await ddb.send(new ScanCommand({ TableName: "fep-gradi-analyses", ProjectionExpression: "videoId" }));
    const completedAnalysisIds = new Set((analysesRes.Items ?? []).map(a => a.videoId));
    console.log(`Found ${completedAnalysisIds.size} completed analyses.`);

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const ytId = extractYouTubeId(v.youtubeUrl);
      if (!ytId) {
        console.log(`[SKIPPED] Video "${v.title}" (${v.videoId}) has no valid YouTube ID in URL: "${v.youtubeUrl}"`);
        continue;
      }

      const standardUrl = `https://www.youtube.com/watch?v=${ytId}`;
      console.log(`\n[${i + 1}/${videos.length}] Processing: "${v.title}" (${v.videoId})`);
      console.log(`- YouTube ID: ${ytId}`);
      console.log(`- Standardized URL: ${standardUrl}`);

      // 3. Fetch up-to-date metadata
      const metadata = await fetchYouTubeMetadata(ytId);
      let updatedTitle = v.title;
      let updatedDuration = v.duration;
      let updatedThumb = v.thumbnailUrl;
      let updatedViews = v.views ?? 0;
      let updatedLikes = v.likes ?? 0;

      if (metadata) {
        if (metadata.title && (!v.title || v.title === "Untitled Video" || v.title === "")) {
          console.log(`  * Healing Title: "${v.title}" -> "${metadata.title}"`);
          updatedTitle = metadata.title;
        }
        if (metadata.duration && !v.duration) {
          console.log(`  * Healing Duration: "${metadata.duration}"`);
          updatedDuration = metadata.duration;
        }
        if (metadata.thumbnailUrl && !v.thumbnailUrl) {
          updatedThumb = metadata.thumbnailUrl;
        }
        if (metadata.views !== undefined) {
          updatedViews = metadata.views;
        }
        if (metadata.likes !== undefined) {
          updatedLikes = metadata.likes;
        }
      }

      // Update basic fields in DB
      await ddb.send(
        new UpdateCommand({
          TableName: "fep-videos",
          Key: { facultyId: v.facultyId, videoId: v.videoId },
          UpdateExpression: "SET youtubeUrl = :url, title = :t, #dur = :dur, thumbnailUrl = :thumb, #views = :v, likes = :l",
          ExpressionAttributeNames: { "#views": "views", "#dur": "duration" },
          ExpressionAttributeValues: {
            ":url": standardUrl,
            ":t": updatedTitle,
            ":dur": updatedDuration || "",
            ":thumb": updatedThumb || "",
            ":v": updatedViews,
            ":l": updatedLikes,
          },
        })
      );
      console.log("  * Updated video metadata & standardised URL in DB.");

      // 4. Check if Gradi analysis is missing or not completed
      const hasAnalysis = completedAnalysisIds.has(v.videoId);
      const isManagerRated = v.status === "manager_rated";
      const needsAnalysis = !hasAnalysis && !isManagerRated;

      if (needsAnalysis) {
        console.log(`  * Analysis missing or not completed. Triggering Gradi analysis...`);
        // Set temporary status to analyzing
        await ddb.send(
          new UpdateCommand({
            TableName: "fep-videos",
            Key: { facultyId: v.facultyId, videoId: v.videoId },
            UpdateExpression: "SET #s = :s",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": "analyzing" },
          })
        );

        try {
          const analysis = await analyzeWithGradi(standardUrl, v.videoId);
          await ddb.send(
            new PutCommand({ TableName: "fep-gradi-analyses", Item: analysis })
          );
          await ddb.send(
            new UpdateCommand({
              TableName: "fep-videos",
              Key: { facultyId: v.facultyId, videoId: v.videoId },
              UpdateExpression: "SET #s = :s",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":s": "gradi_done" },
            })
          );
          console.log(`  * SUCCESS: Gradi Score = ${analysis.gradiScore}/5`);
        } catch (err: any) {
          console.error(`  * FAILED Gradi analysis: ${err.message}`);
          await ddb.send(
            new UpdateCommand({
              TableName: "fep-videos",
              Key: { facultyId: v.facultyId, videoId: v.videoId },
              UpdateExpression: "SET #s = :s",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: { ":s": "no_transcript" },
            })
          );
          console.log("  * Status set to 'no_transcript'");
        }

        // Small cooldown to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`  * Video already has completed analysis or is manager rated.`);
      }
    }

    console.log("\n=== HEALING AND RETRYING ALL VIDEOS COMPLETED SUCCESSFULLY ===");
  } catch (err: any) {
    console.error("Fatal error:", err);
  }
}

run();
