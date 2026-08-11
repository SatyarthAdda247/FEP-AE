import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

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

async function hasCaptions(ytId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${ytId}&key=${YT_API_KEY}`);
    if (!res.ok) return false;
    const json = await res.json();
    return (json.items && json.items.length > 0);
  } catch {
    return false;
  }
}

async function run() {
  try {
    console.log("Scanning pending videos...");
    const videosRes = await ddb.send(new ScanCommand({ TableName: "fep-videos" }));
    const videos = videosRes.Items || [];

    const analysesRes = await ddb.send(new ScanCommand({ TableName: "fep-gradi-analyses", ProjectionExpression: "videoId" }));
    const analyzedIds = new Set((analysesRes.Items || []).map(item => item.videoId));

    const pending = videos.filter(v => !analyzedIds.has(v.videoId) && v.status !== "manager_rated");
    console.log(`Found ${pending.length} pending videos. Checking YouTube captions status...`);

    let withCaptionsCount = 0;
    for (let i = 0; i < pending.length; i++) {
      const v = pending[i];
      const ytId = extractYouTubeId(v.youtubeUrl);
      if (!ytId) continue;

      const ok = await hasCaptions(ytId);
      if (ok) {
        console.log(`[HAS CAPTIONS] Video ID: ${v.videoId} | YouTube ID: ${ytId} | Title: "${v.title}"`);
        withCaptionsCount++;
      }
      
      // Rate limit safety
      if (i % 20 === 0 && i > 0) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`Finished. Found ${withCaptionsCount} videos with YouTube transcripts/captions available.`);
  } catch (err) {
    console.error(err);
  }
}

run();
