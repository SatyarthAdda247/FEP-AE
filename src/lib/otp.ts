import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { PutCommand, GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamodb";

/**
 * Phone OTP verification service.
 *
 * Codes are 6 digits, hashed at rest (bcrypt), expire after 5 minutes, allow
 * at most 5 verify attempts, and are rate-limited to one send per 30s per
 * (purpose, phone). Records live in TABLES.OTPS with a `ttl` attribute so
 * DynamoDB TTL auto-expires them.
 *
 * Delivery is provider-agnostic: set MSG91_AUTH_KEY + MSG91_TEMPLATE_ID (+
 * optional MSG91_SENDER_ID) for real SMS. With no provider configured it runs
 * in "dev mode" — the code is logged server-side and, outside production,
 * returned to the caller so the flow can be exercised locally.
 */

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

export type OtpPurpose = "password_reset" | "phone_verify";

export function normalizePhone(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(-10);
}

function keyFor(purpose: OtpPurpose, phone: string) {
  return `${purpose}#${phone}`;
}

interface OtpRecord {
  otpKey: string;
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: number;   // epoch ms
  attempts: number;
  createdAt: number;   // epoch ms
  ttl: number;         // epoch seconds (DynamoDB TTL)
}

// Fast2SMS key. Hardcoded default per request; env var still overrides it.
// WARNING: this is a live, send-capable credential — never push this file to
// a PUBLIC repo (rotate the key immediately if it ever lands in one).
const FAST2SMS_API_KEY =
  process.env.FAST2SMS_API_KEY ||
  "KVB2XMHpqZYhTdwWD5nvozgtxRPJ1LjbilmS6acuNO08QyG4ErQin6cjZrh07qVg2w38EOftRDKMHAoX";

// Pick a provider by whichever credentials are present. Fast2SMS is the
// simplest free option (free signup credits, no DLT template needed for its
// OTP route); MSG91 is the enterprise option. With neither set → dev mode.
function activeProvider(): "fast2sms" | "msg91" | null {
  if (FAST2SMS_API_KEY) return "fast2sms";
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) return "msg91";
  return null;
}
function providerConfigured(): boolean {
  return activeProvider() !== null;
}

async function sendViaFast2SMS(phone: string, code: string): Promise<void> {
  // Fast2SMS OTP route: https://www.fast2sms.com/dev/bulkV2
  // Sends "Your OTP: <code>" from Fast2SMS's OTP sender. No template needed.
  const params = new URLSearchParams({
    route: "otp",
    variables_values: code,
    numbers: phone, // 10-digit Indian number
    flash: "0",
  });
  const res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params.toString()}`, {
    method: "GET",
    headers: { authorization: FAST2SMS_API_KEY },
  });
  const body = await res.text().catch(() => "");
  // Fast2SMS returns 200 with { return: true } on success, or an error JSON.
  if (!res.ok || !/"return"\s*:\s*true/.test(body)) {
    throw new Error(`Fast2SMS error ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function sendViaMsg91(phone: string, code: string): Promise<void> {
  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: { authkey: process.env.MSG91_AUTH_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: process.env.MSG91_TEMPLATE_ID,
      ...(process.env.MSG91_SENDER_ID ? { sender: process.env.MSG91_SENDER_ID } : {}),
      recipients: [{ mobiles: `91${phone}`, otp: code, var1: code }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MSG91 error ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function sendSms(phone: string, code: string): Promise<void> {
  const provider = activeProvider();
  if (!provider) {
    // Dev mode — never send, just log. (Do not log in production.)
    if (process.env.NODE_ENV !== "production") {
      console.log(`[otp] (dev) code for ${phone}: ${code}`);
    }
    return;
  }
  if (provider === "fast2sms") return sendViaFast2SMS(phone, code);
  return sendViaMsg91(phone, code);
}

export async function sendOtp(
  rawPhone: string,
  purpose: OtpPurpose
): Promise<{ ok: true; devCode?: string } | { ok: false; error: string; retryAfterMs?: number }> {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return { ok: false, error: "Enter a valid 10-digit mobile number" };

  const otpKey = keyFor(purpose, phone);
  const now = Date.now();

  const existing = await ddb.send(new GetCommand({ TableName: TABLES.OTPS, Key: { otpKey } }));
  const prev = existing.Item as OtpRecord | undefined;
  if (prev && now - prev.createdAt < RESEND_COOLDOWN_MS) {
    return { ok: false, error: "Please wait a few seconds before requesting another code", retryAfterMs: RESEND_COOLDOWN_MS - (now - prev.createdAt) };
  }

  const code = String(randomInt(100000, 1000000)); // 6 digits, no leading-zero loss
  const codeHash = await bcrypt.hash(code, 8);
  const record: OtpRecord = {
    otpKey, phone, purpose, codeHash,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    createdAt: now,
    ttl: Math.floor((now + OTP_TTL_MS) / 1000) + 60, // small grace before TTL sweep
  };
  await ddb.send(new PutCommand({ TableName: TABLES.OTPS, Item: record }));

  try {
    await sendSms(phone, code);
  } catch (e) {
    console.error("[otp] send failed:", e);
    return { ok: false, error: "Could not send the code right now. Please try again." };
  }

  const devCode = !providerConfigured() && process.env.NODE_ENV !== "production" ? code : undefined;
  return { ok: true, devCode };
}

export async function verifyOtp(
  rawPhone: string,
  purpose: OtpPurpose,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const phone = normalizePhone(rawPhone);
  const otpKey = keyFor(purpose, phone);
  const res = await ddb.send(new GetCommand({ TableName: TABLES.OTPS, Key: { otpKey } }));
  const rec = res.Item as OtpRecord | undefined;

  if (!rec) return { ok: false, error: "No code was requested, or it has expired. Request a new one." };
  if (Date.now() > rec.expiresAt) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.OTPS, Key: { otpKey } }));
    return { ok: false, error: "This code has expired. Request a new one." };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.OTPS, Key: { otpKey } }));
    return { ok: false, error: "Too many incorrect attempts. Request a new code." };
  }

  const match = await bcrypt.compare(String(code ?? "").trim(), rec.codeHash);
  if (!match) {
    await ddb.send(new UpdateCommand({
      TableName: TABLES.OTPS, Key: { otpKey },
      UpdateExpression: "SET attempts = attempts + :one",
      ExpressionAttributeValues: { ":one": 1 },
    }));
    return { ok: false, error: "Incorrect code. Please try again." };
  }

  // Single-use: consume on success
  await ddb.send(new DeleteCommand({ TableName: TABLES.OTPS, Key: { otpKey } }));
  return { ok: true };
}
