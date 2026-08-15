import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { ddb, TABLES, scanAll } from "@/lib/dynamodb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook that a Google Apps Script (bound to the Campus Program sheet) calls
 * whenever the Raw-Orders tab changes. The script pushes the rows here; this
 * endpoint is the source of truth for who gets enrolled.
 *
 * Enterprise-appropriate: the sheet stays private, no Claude/Google connector
 * is involved — auth is a shared secret (ORDERS_SYNC_SECRET) sent by the script.
 * See scripts/apps-script/sync-orders.gs for the script + trigger setup.
 */

const COHORT_NAME = "August EduSkill";
const REVENUE_THRESHOLD = 1500;          // only paid > this get enrolled
const DEFAULT_PASSWORD = "August@2026";  // shared first-login password (reset via onboarding)

const digits10 = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

interface IncomingRow { phone?: unknown; name?: unknown; revenue?: unknown }
interface Person { phone: string; name: string; revenue: number }

/** Dedup incoming rows by phone (keep max revenue + best-cased name), then
 *  keep only those above the threshold. */
function qualify(rows: IncomingRow[]): Person[] {
  const byPhone = new Map<string, Person>();
  for (const r of rows) {
    const phone = digits10(r.phone);
    if (phone.length !== 10) continue;
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    const revenue = Number(String(r.revenue ?? "").replace(/[^0-9.]/g, "")) || 0;
    const existing = byPhone.get(phone);
    if (!existing) {
      byPhone.set(phone, { phone, name, revenue });
    } else {
      if (revenue > existing.revenue) existing.revenue = revenue;
      if (name && existing.name === existing.name.toUpperCase() && name !== name.toUpperCase()) {
        existing.name = name;
      }
    }
  }
  return [...byPhone.values()].filter(p => p.revenue > REVENUE_THRESHOLD);
}

export async function POST(req: Request) {
  // ── Auth: shared secret from the Apps Script ──
  const secret = process.env.ORDERS_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ORDERS_SYNC_SECRET is not configured on the server" }, { status: 500 });
  }
  const provided = req.headers.get("x-sync-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== secret) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: { rows?: IncomingRow[]; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) {
    return NextResponse.json({ error: "Body must be { rows: [{ phone, name, revenue }, ...] }" }, { status: 400 });
  }

  const people = qualify(rows);

  // Existing accounts keyed by phone (paginated so nobody is missed)
  const existingUsers = await scanAll({ TableName: TABLES.USERS, ProjectionExpression: "phone" });
  const existingPhones = new Set(
    existingUsers.map(u => (u.phone ? digits10(u.phone) : "")).filter(p => p.length === 10)
  );
  const toCreate = people.filter(p => !existingPhones.has(p.phone));

  if (body.dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, cohort: COHORT_NAME,
      received: rows.length, qualifying: people.length,
      alreadyEnrolled: people.length - toCreate.length, wouldCreate: toCreate.length,
    });
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  let created = 0;
  for (const p of toCreate) {
    await ddb.send(new PutCommand({
      TableName: TABLES.USERS,
      Item: {
        userId: uuid(),
        name: p.name,
        email: `${p.phone}@pending.eduskill`,
        phone: p.phone,
        role: "eduskill_faculty",
        cohort: COHORT_NAME,
        subjects: [],
        passwordHash,
        profileComplete: false,
        createdAt: new Date().toISOString(),
        source: "orders-sync",
      },
    }));
    existingPhones.add(p.phone);
    created++;
  }

  return NextResponse.json({
    ok: true, cohort: COHORT_NAME,
    received: rows.length, qualifying: people.length,
    alreadyEnrolled: people.length - toCreate.length, created,
  });
}
