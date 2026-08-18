"use client";

/**
 * MSG91 OTP widget (client-side). The widget sends and verifies the OTP over
 * SMS/WhatsApp/Voice/Email; on success it returns a short-lived access token
 * (JWT) which the server verifies via MSG91's verifyAccessToken API.
 *
 * widgetId + tokenAuth are public by design (they ship in the browser widget
 * config), so they live here rather than in server env.
 */

const WIDGET_ID = "366872654d68373139313738";
const TOKEN_AUTH = "561716T0Weq8Je6a83f013P1";

const SCRIPT_URLS = [
  "https://verify.msg91.com/otp-provider.js",
  "https://verify.phone91.com/otp-provider.js",
];

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, success: (d: unknown) => void, failure: (e: unknown) => void) => void;
    verifyOtp?: (otp: string, success: (d: unknown) => void, failure: (e: unknown) => void) => void;
    retryOtp?: (channel: string | null, success: (d: unknown) => void, failure: (e: unknown) => void) => void;
  }
}

let loadPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("MSG91 widget is client-only"));
  if (typeof window.sendOtp === "function") return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    let i = 0;
    const attempt = () => {
      const s = document.createElement("script");
      s.src = SCRIPT_URLS[i];
      s.async = true;
      s.onload = () => {
        if (typeof window.initSendOTP === "function") {
          window.initSendOTP({
            widgetId: WIDGET_ID,
            tokenAuth: TOKEN_AUTH,
            exposeMethods: true, // gives us window.sendOtp / verifyOtp / retryOtp
            success: () => {},
            failure: () => {},
          });
          resolve();
        } else {
          reject(new Error("MSG91 widget failed to initialise"));
        }
      };
      s.onerror = () => {
        i++;
        if (i < SCRIPT_URLS.length) attempt();
        else reject(new Error("Could not load the OTP service. Check your connection and try again."));
      };
      document.head.appendChild(s);
    };
    attempt();
  });
  return loadPromise;
}

function errMessage(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
  }
  return fallback;
}

/** Send an OTP to a 10-digit Indian mobile number (country code prepended). */
export async function sendOtp(phone10: string): Promise<void> {
  await ensureLoaded();
  return new Promise((resolve, reject) => {
    window.sendOtp!(
      `91${phone10}`,
      () => resolve(),
      (e) => reject(new Error(errMessage(e, "Could not send the code. Please try again.")))
    );
  });
}

/** Verify the entered OTP; resolves with the MSG91 access token on success. */
export async function verifyOtp(code: string): Promise<string> {
  await ensureLoaded();
  return new Promise((resolve, reject) => {
    window.verifyOtp!(
      code,
      (d) => {
        const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
        const token = typeof d === "string" ? d : (o.message ?? o.accessToken ?? o.access_token);
        if (token) resolve(String(token));
        else reject(new Error("Verification succeeded but no token was returned."));
      },
      (e) => reject(new Error(errMessage(e, "Incorrect or expired code.")))
    );
  });
}

/** Resend the OTP (optionally over a specific channel: SMS/WHATSAPP/VOICE/EMAIL). */
export async function resendOtp(channel: string | null = null): Promise<void> {
  await ensureLoaded();
  return new Promise((resolve, reject) => {
    window.retryOtp!(
      channel,
      () => resolve(),
      (e) => reject(new Error(errMessage(e, "Could not resend the code.")))
    );
  });
}
