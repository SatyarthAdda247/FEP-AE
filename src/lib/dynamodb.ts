import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, type ScanCommandInput } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});

export const TABLES = {
  USERS: "fep-users",
  COHORTS: "fep-cohorts",
  SELECTED: "fep-selected-candidates",
  VIDEOS: "fep-videos",
  ANALYSES: "fep-gradi-analyses",
  RATINGS: "fep-manager-ratings",
  SUBJECTS: "fep-subjects",
  YT_STATS: "fep-yt-stats",   // per-faculty YouTube aggregate cache (synced hourly)
  PROFILE_REQUESTS: "fep-profile-requests", // pending faculty profile edit requests for admin approval
} as const;

/**
 * A single Scan page caps at 1MB, which silently truncates results on
 * tables past a few hundred rows (fep-users has bitten this more than
 * once — cohort member counts and onboarding exports both undercounted
 * because of a bare ScanCommand). Use this instead of `ddb.send(new
 * ScanCommand(...))` for any Scan expected to return "all matching rows".
 */
export async function scanAll(input: ScanCommandInput): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: ScanCommandInput["ExclusiveStartKey"];
  do {
    const page = await ddb.send(new ScanCommand({ ...input, ExclusiveStartKey: lastKey }));
    items.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
