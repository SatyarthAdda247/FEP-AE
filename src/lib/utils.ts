import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scoreColor(score: number): string {
  if (score >= 4) return "#10b981";
  if (score >= 3) return "#f59e0b";
  return "#f43f5e";
}

export function scoreTone(score: number): "emerald" | "amber" | "rose" {
  if (score >= 4) return "emerald";
  if (score >= 3) return "amber";
  return "rose";
}

export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // If it's already a raw 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,                         // watch?v=ID or &v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,                    // youtu.be/ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,          // embed/ID
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,         // shorts/ID
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,           // live/ID
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,              // v/ID
    /youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/,    // nocookie embed
  ];

  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m && m[1]) return m[1];
  }

  // Fallback pattern matching
  const fallbackPattern = /(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/;
  const fallbackMatch = trimmed.match(fallbackPattern);
  if (fallbackMatch && fallbackMatch[1]) return fallbackMatch[1];

  return null;
}

export function youtubeThumb(url: string | null | undefined): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso || iso === "undefined" || iso === "null") return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso || iso === "undefined" || iso === "null") return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  if (dy < 7) return `${dy}d ago`;
  return formatDate(iso);
}

export function calculateAgeFromDob(isoOrDateStr: string | null | undefined): string {
  if (!isoOrDateStr) return "";
  const birth = new Date(isoOrDateStr);
  if (isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : "";
}
