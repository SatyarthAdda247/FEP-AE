import { config } from "dotenv";
config({ path: ".env.local" });
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const tables = [
  {
    TableName: "fep-users",
    KeySchema: [{ AttributeName: "userId", KeyType: "HASH" as const }],
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" as const },
      { AttributeName: "email", AttributeType: "S" as const },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "email-index",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" as const }],
        Projection: { ProjectionType: "ALL" as const },
      },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
  {
    TableName: "fep-cohorts",
    KeySchema: [{ AttributeName: "cohortId", KeyType: "HASH" as const }],
    AttributeDefinitions: [
      { AttributeName: "cohortId", AttributeType: "S" as const },
      { AttributeName: "inviteCode", AttributeType: "S" as const },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "inviteCode-index",
        KeySchema: [{ AttributeName: "inviteCode", KeyType: "HASH" as const }],
        Projection: { ProjectionType: "ALL" as const },
      },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
  {
    // Candidates marked "selected" per cohort — imported from evaluation sheets
    // or toggled from the manager roster
    TableName: "fep-selected-candidates",
    KeySchema: [{ AttributeName: "candidateId", KeyType: "HASH" as const }],
    AttributeDefinitions: [
      { AttributeName: "candidateId", AttributeType: "S" as const },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
  {
    TableName: "fep-videos",
    KeySchema: [
      { AttributeName: "facultyId", KeyType: "HASH" as const },
      { AttributeName: "videoId", KeyType: "RANGE" as const },
    ],
    AttributeDefinitions: [
      { AttributeName: "facultyId", AttributeType: "S" as const },
      { AttributeName: "videoId", AttributeType: "S" as const },
      { AttributeName: "subjectId", AttributeType: "S" as const },
      { AttributeName: "uploadedAt", AttributeType: "S" as const },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "subjectId-uploadedAt-index",
        KeySchema: [
          { AttributeName: "subjectId", KeyType: "HASH" as const },
          { AttributeName: "uploadedAt", KeyType: "RANGE" as const },
        ],
        Projection: { ProjectionType: "ALL" as const },
      },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
  {
    TableName: "fep-gradi-analyses",
    KeySchema: [{ AttributeName: "videoId", KeyType: "HASH" as const }],
    AttributeDefinitions: [
      { AttributeName: "videoId", AttributeType: "S" as const },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
  {
    TableName: "fep-manager-ratings",
    KeySchema: [
      { AttributeName: "videoId", KeyType: "HASH" as const },
      { AttributeName: "managerId", KeyType: "RANGE" as const },
    ],
    AttributeDefinitions: [
      { AttributeName: "videoId", AttributeType: "S" as const },
      { AttributeName: "managerId", AttributeType: "S" as const },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
  {
    TableName: "fep-subjects",
    KeySchema: [{ AttributeName: "subjectId", KeyType: "HASH" as const }],
    AttributeDefinitions: [
      { AttributeName: "subjectId", AttributeType: "S" as const },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
  {
    // Per-faculty YouTube aggregate cache — updated hourly by /api/youtube-sync
    TableName: "fep-yt-stats",
    KeySchema: [{ AttributeName: "facultyId", KeyType: "HASH" as const }],
    AttributeDefinitions: [
      { AttributeName: "facultyId", AttributeType: "S" as const },
    ],
    BillingMode: "PAY_PER_REQUEST" as const,
  },
];

async function tableExists(name: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (e) {
    if (e instanceof ResourceNotFoundException) return false;
    throw e;
  }
}

async function main() {
  for (const t of tables) {
    const exists = await tableExists(t.TableName);
    if (exists) {
      console.log(`✓ ${t.TableName} already exists`);
      continue;
    }
    console.log(`→ Creating ${t.TableName}...`);
    await client.send(new CreateTableCommand(t));
    await waitUntilTableExists(
      { client, maxWaitTime: 120 },
      { TableName: t.TableName }
    );
    console.log(`✓ ${t.TableName} ready`);
  }
  console.log("\nAll tables provisioned.");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
