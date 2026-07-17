import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

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
} as const;
