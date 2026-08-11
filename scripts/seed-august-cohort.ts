/**
 * Create the "August EduSkill" cohort and seed faculty accounts for every
 * person in the Campus Program revenue report whose paid revenue exceeds
 * a threshold (default ₹1500).
 *
 * Input is a JSON array of { phone, name, revenue, paid_date, orderid }
 * read from AUGUST_COHORT_JSON — an ABSOLUTE PATH OUTSIDE THIS REPO.
 * Do not point this at a file under scripts/data/: this script ingests
 * real customer PII (name + phone), and committing that data has bitten
 * this repo before (see git history). Keep the source JSON in a scratch
 * directory and pass its path via the env var.
 *
 * Each account gets:
 *   - email:  "<phone>@pending.eduskill"  (placeholder login identifier —
 *              replaced with the person's real email via the onboarding form)
 *   - password: the shared DEFAULT_PASSWORD below (communicate out of band)
 *   - profileComplete: false — forces the onboarding form on first login
 *
 * Idempotent: skips any phone number that already has an account.
 *
 * Run:
 *   AUGUST_COHORT_JSON=/path/to/august-cohort-users.json \
 *     npx tsx --env-file=.env.local scripts/seed-august-cohort.ts
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

const COHORT_NAME = "August EduSkill";
const REVENUE_THRESHOLD = 1500;
const DEFAULT_PASSWORD = "August@2026";

interface RevenueRow {
  orderid?: string;
  phone: string;
  name: string;
  paid_date?: string;
  revenue: number | string;
}

function generateInviteCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

async function main() {
  const inputPath = process.env.AUGUST_COHORT_JSON;
  if (!inputPath) {
    console.error("Set AUGUST_COHORT_JSON to an absolute path outside this repo.");
    process.exit(1);
  }

  const rows: RevenueRow[] = JSON.parse(readFileSync(inputPath, "utf8"));
  const qualifying = rows.filter(r => Number(r.revenue) > REVENUE_THRESHOLD);
  console.log(`${rows.length} input rows, ${qualifying.length} above ₹${REVENUE_THRESHOLD}`);

  // Ensure the cohort exists (idempotent)
  const existingCohorts = await ddb.send(new ScanCommand({
    TableName: "fep-cohorts",
    FilterExpression: "#n = :n",
    ExpressionAttributeNames: { "#n": "name" },
    ExpressionAttributeValues: { ":n": COHORT_NAME },
  }));
  if (!existingCohorts.Items?.length) {
    await ddb.send(new PutCommand({
      TableName: "fep-cohorts",
      Item: {
        cohortId: uuid(),
        name: COHORT_NAME,
        inviteCode: generateInviteCode(),
        signupOpen: false, // pre-vetted paid list, not open self-signup
        createdBy: "seed-august-cohort-script",
        createdAt: new Date().toISOString(),
      },
    }));
    console.log(`✓ created cohort "${COHORT_NAME}"`);
  } else {
    console.log(`✓ cohort "${COHORT_NAME}" already exists`);
  }

  // Skip phones that already have an account (idempotent re-runs)
  const existingUsers = await ddb.send(new ScanCommand({
    TableName: "fep-users",
    ProjectionExpression: "phone",
  }));
  const existingPhones = new Set(
    (existingUsers.Items ?? [])
      .map(u => (u.phone ? String(u.phone).replace(/\D/g, "").slice(-10) : null))
      .filter(Boolean)
  );

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  let created = 0, skipped = 0;

  for (const row of qualifying) {
    const phoneDigits = String(row.phone).replace(/\D/g, "").slice(-10);
    if (existingPhones.has(phoneDigits)) { skipped++; continue; }

    await ddb.send(new PutCommand({
      TableName: "fep-users",
      Item: {
        userId: uuid(),
        name: row.name.trim(),
        email: `${phoneDigits}@pending.eduskill`,
        phone: phoneDigits,
        role: "eduskill_faculty",
        cohort: COHORT_NAME,
        subjects: [],
        passwordHash,
        profileComplete: false,
        createdAt: new Date().toISOString(),
      },
    }));
    existingPhones.add(phoneDigits);
    created++;
  }

  console.log(`\n✓ created ${created} accounts, skipped ${skipped} existing phone numbers.`);
  console.log(`Login: email "<10-digit phone>@pending.eduskill", password "${DEFAULT_PASSWORD}"`);
  console.log(`They will be required to complete the onboarding form on first login.`);
}

main().catch(e => { console.error(e); process.exit(1); });
