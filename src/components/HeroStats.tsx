"use client";
import { motion } from "framer-motion";
import { ScoreRing } from "./ScoreRing";
import { TrendingUp, Video, BadgeCheck, Eye, ThumbsUp, Users } from "lucide-react";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

interface HeroStatsProps {
  name: string;
  netScore: number;
  totalVideos: number;
  pctRated: number;
  trendDelta?: number;
  // YouTube aggregate stats
  totalViews?: number;
  totalLikes?: number;
  subscribers?: number;
  ytStatsSyncedAt?: string | null;
  age?: number;
  gender?: string;
  teachingSubject?: string;
  verticals?: string[];
  hideSubscribers?: boolean;
}

export function HeroStats({
  name,
  netScore,
  totalVideos,
  pctRated,
  trendDelta = 0,
  totalViews = 0,
  totalLikes = 0,
  subscribers = 0,
  ytStatsSyncedAt,
  age,
  gender,
  teachingSubject,
  verticals,
  hideSubscribers = false,
}: HeroStatsProps) {
  const hasCachedStats = (ytStatsSyncedAt !== null && ytStatsSyncedAt !== undefined && ytStatsSyncedAt !== "") || totalVideos === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong rounded-2xl p-6 md:p-8"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-8">
        {/* Score box + name */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-6 py-5 text-center min-w-[120px] shadow-sm shrink-0">
            <span className="text-mono text-3xl font-bold tracking-tight text-emerald-400">
              {netScore.toFixed(1)}
            </span>
            <span className="text-[9px] uppercase tracking-[0.12em] font-semibold text-emerald-500 mt-1">
              NET SCORE
            </span>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-muted">
              Welcome
            </p>
            <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">
              {name}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Here&apos;s how your content is performing.
            </p>
            
            {/* Input taken metadata */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
              {age && (
                <span className="bg-bg-elev/50 px-2 py-0.5 rounded border border-border/30">
                  <strong className="text-fg-dim font-medium">Age:</strong> {age}
                </span>
              )}
              {gender && (
                <span className="bg-bg-elev/50 px-2 py-0.5 rounded border border-border/30">
                  <strong className="text-fg-dim font-medium">Gender:</strong> {gender}
                </span>
              )}
              {teachingSubject && (
                <span className="bg-bg-elev/50 px-2 py-0.5 rounded border border-border/30">
                  <strong className="text-fg-dim font-medium">Subject:</strong> {teachingSubject}
                </span>
              )}
              {verticals && verticals.length > 0 && (
                <span className="bg-bg-elev/50 px-2 py-0.5 rounded border border-border/30">
                  <strong className="text-fg-dim font-medium">Vertical:</strong> {verticals.join(", ")}
                </span>
              )}
            </div>

            {ytStatsSyncedAt && !isNaN(new Date(ytStatsSyncedAt).getTime()) && (
              <p className="mt-2 text-[10px] text-fg-dim">
                YT stats synced {new Date(ytStatsSyncedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className={`flex-1 grid grid-cols-2 sm:grid-cols-3 ${hideSubscribers ? "lg:grid-cols-4" : "lg:grid-cols-5"} gap-3`}>
          <Stat
            icon={<Video className="h-3.5 w-3.5" />}
            label="Videos"
            value={totalVideos.toString()}
            sub="uploaded"
          />
          <Stat
            icon={<BadgeCheck className="h-3.5 w-3.5" />}
            label="Scored"
            value={`${pctRated}%`}
            sub="by manager"
          />
          <Stat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Trend"
            value={trendDelta >= 0 ? `+${trendDelta.toFixed(1)}` : trendDelta.toFixed(1)}
            sub="vs last week"
            tone={trendDelta >= 0 ? "emerald" : "rose"}
          />
          <Stat
            icon={<Eye className="h-3.5 w-3.5" />}
            label="Total Views"
            value={hasCachedStats ? formatCount(totalViews) : "—"}
            sub="across all videos"
            tone="blue"
            loading={!hasCachedStats}
          />
          {!hideSubscribers && (
            <Stat
              icon={<Users className="h-3.5 w-3.5" />}
              label="Subscribers"
              value={hasCachedStats ? formatCount(subscribers) : "—"}
              sub="channel subs"
              tone="violet"
              loading={!hasCachedStats}
            />
          )}
        </div>
      </div>

      {/* Likes row — subtle secondary strip */}
      {hasCachedStats && totalLikes > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3"
        >
          <ThumbsUp className="h-3 w-3 text-fg-dim" />
          <span className="text-[11px] text-fg-dim">
            <span className="font-semibold text-fg">{formatCount(totalLikes)}</span>
            {" "}total likes across all videos
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
  loading = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: "emerald" | "rose" | "blue" | "violet";
  loading?: boolean;
}) {
  const colorMap: Record<string, string> = {
    emerald: "var(--emerald)",
    rose: "var(--rose)",
    blue: "#60a5fa",
    violet: "#a78bfa",
  };
  const color = tone ? colorMap[tone] : "var(--fg)";

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-xl border border-border bg-bg-elev/40 p-4"
    >
      <div className="flex items-center gap-1.5 text-fg-muted">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div
        className="mt-2 text-mono text-2xl font-semibold tracking-tight"
        style={{ color: loading ? "var(--fg-dim)" : color }}
      >
        {loading ? (
          <span className="text-base animate-pulse text-fg-dim">syncing…</span>
        ) : (
          value
        )}
      </div>
      <div className="mt-0.5 text-[11px] text-fg-dim">{sub}</div>
    </motion.div>
  );
}
