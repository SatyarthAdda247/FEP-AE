/**
 * Normalize Subject / Vertical values on fep-selected-candidates.
 * Collapses casing duplicates, fixes typos, and maps synonyms to one
 * canonical value per concept. Idempotent — reruns are no-ops.
 *
 * Run: npx tsx --env-file=.env.local scripts/normalize-selected-subjects.ts
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

// Canonical subject per raw sheet value (keys are lowercased + trimmed)
export const SUBJECT_MAP: Record<string, string> = {
  "maths": "Maths",
  "maths bengali medium": "Maths",
  "bio": "Biology",
  "english litreture": "English Literature",
  "humanaties": "Humanities",
  "political science / civics": "Political Science",
  "polity and governance": "Polity",
  "indian polity and modern history": "Polity/History",
  "thermal, fluid, design and manufacturing": "Mechanical",
  "arabic,urdu": "Arabic/Urdu",
  "all subject": "All Subjects",
  "history / hindi": "History/Hindi",
  "science/computer": "Science/Computer",
  "hindi/gk/gs": "Hindi/GK/GS",
  "physics/iti": "Physics/ITI",
  "cdp/english": "CDP/English",
  "gk/gs": "GK/GS",
  "cdp": "CDP",
};

// Canonical vertical per raw sheet value
export const VERTICAL_MAP: Record<string, string> = {
  "ssc": "SSC",
  "cuet ug/pg": "CUET UG/PG",
  "11th/ 12th/neet": "NEET (11th/12th)",
  "11th/12th/neet": "NEET (11th/12th)",
  "foundation": "Foundation",
  "siq": "SIQ",
  "teaching": "Teaching",
  "banking": "Banking",
  "railways": "Railways",
  "engineering": "Engineering",
  "ugc net": "UGC NET",
  "nursing": "Nursing",
};

function titleCaseWord(w: string): string {
  return w ? w[0].toUpperCase() + w.slice(1) : w;
}

export function normalizeSubject(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = raw.replace(/\s+/g, " ").trim();
  return SUBJECT_MAP[t.toLowerCase()] ?? titleCaseWord(t);
}

export function normalizeVertical(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = raw.replace(/\s+/g, " ").trim();
  return VERTICAL_MAP[t.toLowerCase()] ?? t;
}

async function main() {
  const r = await ddb.send(new ScanCommand({ TableName: "fep-selected-candidates" }));
  const items = r.Items ?? [];
  let changed = 0;
  for (const item of items) {
    const subject = normalizeSubject(item.subject);
    const vertical = normalizeVertical(item.vertical);
    const parts: string[] = [];
    const values: Record<string, unknown> = {};
    if (subject !== undefined && subject !== item.subject) { parts.push("subject = :s"); values[":s"] = subject; }
    if (vertical !== undefined && vertical !== item.vertical) { parts.push("vertical = :v"); values[":v"] = vertical; }
    if (!parts.length) continue;
    console.log(`${item.regNo ?? item.candidateId}: subject "${item.subject}" -> "${subject}" | vertical "${item.vertical}" -> "${vertical}"`);
    await ddb.send(new UpdateCommand({
      TableName: "fep-selected-candidates",
      Key: { candidateId: item.candidateId },
      UpdateExpression: `SET ${parts.join(", ")}`,
      ExpressionAttributeValues: values,
    }));
    changed++;
  }
  console.log(`\nNormalized ${changed}/${items.length} candidates.`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
