/**
 * Seed fep-selected-candidates with the June cohort selections exported from
 * "Copy of Evaluation Sheet June.xlsx" (extracted to data/selected-june.json).
 * Idempotent: candidateId is derived from the sheet's Reg No.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-selected-candidates-june.ts
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { readFileSync } from "fs";
import { join } from "path";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const COHORT = "June EduSkill";

interface SheetRow {
  regNo: string | null;
  name: string | null;
  contact: string | null;
  replacement: string | null;
  newInitiatives: string | null;
  offlineEducators: string | null;
  subject: string | null;
  vertical: string | null;
  resumeText: string | null;
  resumeLink: string | null;
  videoLink: string | null;
}

async function main() {
  const rows: SheetRow[] = JSON.parse(
    readFileSync(join(__dirname, "data", "selected-june.json"), "utf8")
  );

  const items = rows
    .filter(r => r.name)
    .map(r => ({
      candidateId: `june-${(r.regNo ?? r.name!).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      cohort: COHORT,
      name: r.name!,
      regNo: r.regNo ?? undefined,
      contact: r.contact ?? undefined,
      subject: r.subject ?? undefined,
      vertical: r.vertical ?? undefined,
      replacement: r.replacement ?? undefined,
      newInitiatives: r.newInitiatives ?? undefined,
      offlineEducators: r.offlineEducators ?? undefined,
      resumeLink: r.resumeLink ?? undefined,
      videoLink: r.videoLink ?? undefined,
      createdAt: new Date().toISOString(),
    }));

  // BatchWrite in chunks of 25 (DynamoDB limit)
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        "fep-selected-candidates": chunk.map(Item => ({ PutRequest: { Item } })),
      },
    }));
    console.log(`✓ wrote ${Math.min(i + 25, items.length)}/${items.length}`);
  }
  console.log(`\nSeeded ${items.length} selected candidates for "${COHORT}".`);
}

main().catch(e => { console.error(e); process.exit(1); });
