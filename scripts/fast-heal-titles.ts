import { config } from "dotenv";
config({ path: ".env.local" });

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
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

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YT_API_KEY) { throw new Error("Set YOUTUBE_API_KEY in .env.local before running this script"); }

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

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

async function run() {
  try {
    console.log("=== STARTING FAST TITLE AND METADATA HEALING ===");
    const videosRes = await ddb.send(new ScanCommand({ TableName: "fep-videos" }));
    const videos = videosRes.Items ?? [];
    console.log(`Loaded ${videos.length} videos from fep-videos.`);

    let healedCount = 0;

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const ytId = extractYouTubeId(v.youtubeUrl);
      if (!ytId) continue;

      const standardUrl = `https://www.youtube.com/watch?v=${ytId}`;
      const needsTitleHealing = !v.title || v.title === "Untitled Video" || v.title === "";
      const needsUrlStandardizing = v.youtubeUrl !== standardUrl;
      const needsDurationHealing = !v.duration;

      if (needsTitleHealing || needsUrlStandardizing || needsDurationHealing) {
        console.log(`\n[Heal Candidate] Video ID: ${v.videoId} | Current Title: "${v.title}"`);
        const metadata = await fetchYouTubeMetadata(ytId);

        let updatedTitle = v.title;
        let updatedDuration = v.duration;
        let updatedThumb = v.thumbnailUrl;
        let updatedViews = v.views ?? 0;
        let updatedLikes = v.likes ?? 0;

        if (metadata) {
          if (metadata.title && needsTitleHealing) {
            console.log(`  -> Healed Title: "${metadata.title}"`);
            updatedTitle = metadata.title;
          }
          if (metadata.duration && needsDurationHealing) {
            console.log(`  -> Healed Duration: "${metadata.duration}"`);
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

        await ddb.send(
          new UpdateCommand({
            TableName: "fep-videos",
            Key: { facultyId: v.facultyId, videoId: v.videoId },
            UpdateExpression: "SET youtubeUrl = :url, title = :t, #dur = :dur, thumbnailUrl = :thumb, #views = :v, likes = :l",
            ExpressionAttributeNames: { "#views": "views", "#dur": "duration" },
            ExpressionAttributeValues: {
              ":url": standardUrl,
              ":t": updatedTitle || "Untitled Video",
              ":dur": updatedDuration || "",
              ":thumb": updatedThumb || "",
              ":v": updatedViews,
              ":l": updatedLikes,
            },
          })
        );
        healedCount++;
      }
    }

    console.log(`\n=== FAST HEALING COMPLETED: Healed ${healedCount} videos. ===`);
  } catch (err: any) {
    console.error("Fatal error:", err);
  }
}

run();
