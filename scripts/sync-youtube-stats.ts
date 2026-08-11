import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

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

async function run() {
  console.log(`[Sync] Starting period statistics sync: ${new Date().toISOString()}`);
  try {
    const videosRes = await ddb.send(new ScanCommand({ TableName: "fep-videos" }));
    const videos = videosRes.Items || [];
    console.log(`[Sync] Found ${videos.length} videos in total.`);

    const ytIds = videos.map(v => extractYouTubeId(v.youtubeUrl)).filter(Boolean) as string[];
    const videoStats: Record<string, { views: number; likes: number }> = {};

    for (let i = 0; i < ytIds.length; i += 50) {
      const batch = ytIds.slice(i, i + 50);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.join(",")}&key=${YT_API_KEY}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data.items || []) {
        videoStats[item.id] = {
          views: Number(item.statistics?.viewCount || 0),
          likes: Number(item.statistics?.likeCount || 0)
        };
      }
    }

    let updatedCount = 0;
    for (const v of videos) {
      const ytId = extractYouTubeId(v.youtubeUrl);
      const live = ytId ? videoStats[ytId] : null;
      if (live) {
        if (v.views !== live.views || v.likes !== live.likes) {
          await ddb.send(new UpdateCommand({
            TableName: "fep-videos",
            Key: { facultyId: v.facultyId, videoId: v.videoId },
            UpdateExpression: "SET #views = :v, likes = :l",
            ExpressionAttributeNames: { "#views": "views" },
            ExpressionAttributeValues: { ":v": live.views, ":l": live.likes }
          }));
          updatedCount++;
        }
      }
    }
    console.log(`[Sync] Completed sync. Successfully updated stats for ${updatedCount} out-of-sync videos.`);
  } catch (err) {
    console.error("[Sync] Error during statistics sync:", err);
  }
}

run();
