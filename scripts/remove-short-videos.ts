import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const ddb = DynamoDBDocumentClient.from(client);
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YT_API_KEY) { throw new Error("Set YOUTUBE_API_KEY in .env.local before running this script"); }

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  return parts[0] || 0;
}

async function fetchYouTubeDuration(youtubeUrl: string): Promise<string | null> {
  const ytId = extractYouTubeId(youtubeUrl);
  if (!ytId) return null;
  try {
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ytId}&key=${YT_API_KEY}`
    );
    const ytData = await ytRes.json();
    if (!ytData.items?.length) return null;
    const details = ytData.items[0].contentDetails || {};
    const dur = details.duration || "";
    const match = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = match?.[1] ? `${match[1]}:` : "";
    const m = match?.[2] || "0";
    const s = match?.[3]?.padStart(2, "0") || "00";
    return h ? `${h}${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
  } catch (err) {
    console.error("fetchYouTubeDuration error:", err);
    return null;
  }
}

async function run() {
  try {
    console.log("Fetching all videos from DynamoDB...");
    const videosRes = await ddb.send(new ScanCommand({ TableName: "fep-videos" }));
    const videos = videosRes.Items || [];
    console.log(`Found ${videos.length} total videos.`);

    let deletedCount = 0;

    for (const v of videos) {
      let durationStr = v.duration;
      if (!durationStr && v.youtubeUrl) {
        // Fetch from YouTube if missing
        durationStr = await fetchYouTubeDuration(v.youtubeUrl);
      }

      if (durationStr) {
        const seconds = parseDurationToSeconds(durationStr);
        if (seconds > 0 && seconds < 180) {
          console.log(`[DELETE] "${v.title}" (${v.videoId}) - Length: ${durationStr} (${seconds}s) is under 3 minutes.`);
          
          // Delete from fep-videos
          await ddb.send(new DeleteCommand({
            TableName: "fep-videos",
            Key: { facultyId: v.facultyId, videoId: v.videoId }
          }));

          // Delete from fep-gradi-analyses
          await ddb.send(new DeleteCommand({
            TableName: "fep-gradi-analyses",
            Key: { videoId: v.videoId }
          }));

          // Query & delete ratings
          const ratingsRes = await ddb.send(new QueryCommand({
            TableName: "fep-manager-ratings",
            KeyConditionExpression: "videoId = :v",
            ExpressionAttributeValues: { ":v": v.videoId }
          }));
          const ratings = ratingsRes.Items || [];
          for (const rating of ratings) {
            await ddb.send(new DeleteCommand({
              TableName: "fep-manager-ratings",
              Key: { videoId: v.videoId, managerId: rating.managerId }
            }));
          }

          deletedCount++;
        }
      }
    }

    console.log(`Finished cleanup. Removed ${deletedCount} videos under 3 minutes.`);
  } catch (err) {
    console.error("Error in script:", err);
  }
}

run();
