"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Loader2, Play, ExternalLink } from "lucide-react";
import { cn, youtubeThumb } from "@/lib/utils";
import Link from "next/link";
import { VideoDrawer } from "@/components/VideoDrawer";

interface FacultyLeaderRow {
  userId: string;
  name: string;
  email: string;
  subjects: string[];
  videoCount: number;
  netScore?: number;
  installs?: number;
  views?: number;
  subscribersGained?: number;
}

const JUNE_WEEKS = [
  { label: "Week 1", range: "Jun 8–14", start: new Date("2026-06-08T00:00:00Z"), end: new Date("2026-06-14T23:59:59Z") },
  { label: "Week 2", range: "Jun 15–21", start: new Date("2026-06-15T00:00:00Z"), end: new Date("2026-06-21T23:59:59Z") },
  { label: "Week 3", range: "Jun 22–28", start: new Date("2026-06-22T00:00:00Z"), end: new Date("2026-06-28T23:59:59Z") },
  { label: "Week 4", range: "Jun 29–Jul 8", start: new Date("2026-06-29T00:00:00Z"), end: new Date("2026-07-08T23:59:59Z") },
];

const MARCH_WEEKS = [
  { label: "Week 1", range: "Apr 6–12" },
  { label: "Week 2", range: "Apr 13–19" },
  { label: "Week 3", range: "Apr 20–26" },
  { label: "Week 4", range: "Apr 27–May 3" },
];

const WEEK_COLORS = [
  { bg: "bg-[#1e3a5f]", border: "border-[#2d5a8e]", text: "text-blue-200", pill: "bg-blue-600/30" },
  { bg: "bg-[#2d1f5e]", border: "border-[#4a3090]", text: "text-purple-200", pill: "bg-purple-600/30" },
  { bg: "bg-[#1f3d2e]", border: "border-[#2a6040]", text: "text-emerald-200", pill: "bg-emerald-600/30" },
  { bg: "bg-[#4a2010]", border: "border-[#7a3520]", text: "text-orange-200", pill: "bg-orange-600/30" },
];

const AVATAR_COLORS = ["#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function ColorAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  const color = getAvatarColor(name);
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold shrink-0 text-white" style={{ background: color }}>
      {initial}
    </span>
  );
}

export default function LeaderboardPage() {
  const [selectedCohort, setSelectedCohort] = useState<"June EduSkill" | "March EduSkill">("June EduSkill");
  const [selectedTab, setSelectedTab] = useState<string>("leaderboard");
  const [viewMode, setViewMode] = useState<"summary" | "full">("summary");
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: () => fetch("/api/auth/me").then(r => r.json()),
  });
  const user = meQ.data?.user;
  const isManager = user?.role === "eduskill_manager" || user?.role === "eduskill_admin";

  const getFacultyLink = (targetUserId: string) => {
    if (isManager || targetUserId === user?.userId) {
      return `/faculty?facultyId=${targetUserId}`;
    }
    return null;
  };

  const marchQ = useQuery<{ leaderboard: FacultyLeaderRow[]; videos?: any[] }>({
    queryKey: ["leaderboard-march"],
    queryFn: () => fetch("/api/stats?scope=all&cohort=March+EduSkill").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const juneQ = useQuery<{ leaderboard: FacultyLeaderRow[]; videos?: any[] }>({
    queryKey: ["leaderboard-june"],
    queryFn: () => fetch("/api/stats?scope=all&cohort=June+EduSkill").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const archiveQ = useQuery<{ archive: any }>({
    queryKey: ["archive-data"],
    queryFn: () => fetch("/api/archive").then(r => r.json()),
  });

  const loading = (selectedCohort === "June EduSkill" ? juneQ.isLoading : marchQ.isLoading);
  const list = useMemo(() => {
    const raw = selectedCohort === "June EduSkill" ? (juneQ.data?.leaderboard ?? []) : (marchQ.data?.leaderboard ?? []);
    if (selectedCohort === "March EduSkill") {
      return [...raw].sort((a: any, b: any) => (b.installs ?? 0) - (a.installs ?? 0));
    }
    return raw;
  }, [selectedCohort, juneQ.data, marchQ.data]);


  // ── June week-wise per-faculty scores ──────────────────────────
  const juneWeekData = useMemo(() => {
    const videos = juneQ.data?.videos ?? [];
    return JUNE_WEEKS.map((wk, wi) => {
      const scored = list.map(f => {
        const own = videos.filter(v =>
          v.facultyId === f.userId &&
          v.managerScore !== null && v.managerScore !== undefined &&
          v.uploadedAt && new Date(v.uploadedAt) >= wk.start && new Date(v.uploadedAt) <= wk.end
        );
        const scores = own.map((v: any) => v.managerScore).filter((s): s is number => s !== null);
        scores.sort((a, b) => b - a);
        const limit = wi === 0 ? 1 : 3;
        const score = scores.length > 0 ? scores.slice(0, limit).reduce((sum, s) => sum + s, 0) : null;
        return { userId: f.userId, name: f.name, score };
      }).filter(x => x.score !== null) as { userId: string; name: string; score: number }[];

      scored.sort((a, b) => b.score - a.score);
      return {
        ...wk,
        top5: scored.slice(0, 5),
        bottom5: scored.length >= 5 ? [...scored].reverse().slice(0, 5).reverse() : [],
        fullList: scored
      };
    });
  }, [juneQ.data, list]);

  // ── Rated videos for "Videos" tab ─────────────────────────────
  const ratedVideos = useMemo(() => {
    const rawVideos = (selectedCohort === "June EduSkill" ? juneQ.data?.videos : marchQ.data?.videos) ?? [];
    return rawVideos.filter((v: any) => v.managerScore !== null && v.managerScore !== undefined);
  }, [selectedCohort, juneQ.data, marchQ.data]);

  const topVideos = useMemo(() =>
    [...ratedVideos].sort((a: any, b: any) => b.managerScore - a.managerScore).slice(0, 20),
  [ratedVideos]);

  const bottomVideos = useMemo(() =>
    [...ratedVideos].sort((a: any, b: any) => a.managerScore - b.managerScore).slice(0, 20),
  [ratedVideos]);

  const tabs = [
    { key: "leaderboard", label: "Leaderboard" },
    ...(selectedCohort === "June EduSkill" ? [{ key: "videos", label: "Videos" }] : []),
  ];

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-fg-muted" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-8 md:py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Trophy className="h-5 w-5 text-amber-500" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">FEP · Leaderboard</h1>
            <p className="text-[11px] text-fg-muted">Top 5 &amp; Bottom 5 per Week · Auto-calculated from video scores</p>
          </div>
        </div>

        {/* Cohort Selector */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-bg-elev/50 p-1 w-fit">
          {(["June EduSkill", "March EduSkill"] as const).map(c => (
            <button key={c} onClick={() => { setSelectedCohort(c); setSelectedTab("leaderboard"); }}
              className={cn(
                "rounded-lg px-4 py-1.5 text-xs font-medium transition-all cursor-pointer",
                selectedCohort === c ? "bg-fg text-bg shadow-sm" : "text-fg-muted hover:text-fg"
              )}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation tabs & View mode toggle */}
      <div className="flex items-center justify-between mb-6 border-b border-border/40 pb-2 flex-wrap gap-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setSelectedTab(t.key)}
              className={cn("relative px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors isolate cursor-pointer",
                selectedTab === t.key ? "text-white" : "text-fg-muted hover:text-fg border border-border")}
            >
              {selectedTab === t.key && <motion.span layoutId="lb-pill" className="absolute inset-0 rounded-full bg-emerald-600 -z-10" transition={{ duration: 0.2 }} />}
              {t.label}
            </button>
          ))}
        </div>

        {selectedTab === "leaderboard" && selectedCohort === "June EduSkill" && (
          <div className="flex items-center gap-1 rounded-xl border border-border bg-bg-elev/40 p-1">
            <button
              onClick={() => setViewMode("summary")}
              className={cn(
                "rounded-lg px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                viewMode === "summary" ? "bg-fg text-bg shadow-sm" : "text-fg-muted hover:text-fg"
              )}
            >
              Top &amp; Bottom 5
            </button>
            <button
              onClick={() => setViewMode("full")}
              className={cn(
                "rounded-lg px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer",
                viewMode === "full" ? "bg-fg text-bg shadow-sm" : "text-fg-muted hover:text-fg"
              )}
            >
              Complete Rankings
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">

        {/* ── LEADERBOARD TAB: Top 5 & Bottom 5 per Week ── */}
        {selectedTab === "leaderboard" && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* TOP 5 PERFORMERS */}
            {/* TOP & BOTTOM 5 SUMMARY VIEW */}
            {selectedCohort === "June EduSkill" && viewMode === "summary" && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Top 5 Performers</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {juneWeekData.map((wk, wi) => {
                      const col = WEEK_COLORS[wi];
                      return (
                        <motion.div
                          key={wi}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: wi * 0.05 }}
                          className={cn("rounded-2xl border overflow-hidden", col.border)}
                        >
                          {/* Week header */}
                          <div className={cn("px-4 py-2.5", col.bg)}>
                            <div className="flex items-center justify-between">
                              <span className={cn("text-xs font-bold", col.text)}>{wk.label}</span>
                              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", col.text, col.pill)}>{wk.range}</span>
                            </div>
                          </div>

                          {/* Column headers */}
                          <div className="grid grid-cols-[20px_1fr_50px] gap-2 px-3 py-1.5 bg-bg-elev/60 border-b border-border/30">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim">#</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim">Name</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim text-right">Score</span>
                          </div>

                          {/* Rows */}
                          <div className="divide-y divide-border/20">
                            {(wk as any).top5?.length > 0 ? (
                              (wk as any).top5.map((f: any, i: number) => (
                                <div key={f.userId ?? f.name} className="grid grid-cols-[20px_1fr_50px] gap-2 items-center px-3 py-2 hover:bg-bg-elev/40 transition-colors">
                                  <span className={cn(
                                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                                    i === 0 ? "bg-amber-500/20 text-amber-400" : "text-fg-muted"
                                  )}>{i + 1}</span>
                                  {getFacultyLink(f.userId) ? (
                                    <Link href={getFacultyLink(f.userId)!} className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity">
                                      <ColorAvatar name={f.name} />
                                      <span className="text-[11px] font-medium text-violet-400 hover:underline truncate">
                                        {f.name}
                                      </span>
                                    </Link>
                                  ) : (
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <ColorAvatar name={f.name} />
                                      <span className="text-[11px] font-medium text-fg truncate">{f.name}</span>
                                    </div>
                                  )}
                                  <span className="text-[12px] font-bold text-emerald-400 text-right tabular-nums">{f.score?.toFixed(1) ?? f.installs ?? "—"}</span>
                                </div>
                              ))
                            ) : (
                              <div className="px-3 py-6 text-center text-[11px] text-fg-dim">No data yet</div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* BOTTOM 5 — NEEDS ATTENTION */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                    <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wider">Bottom 5 — Needs Attention</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {juneWeekData.map((wk, wi) => {
                      const col = WEEK_COLORS[wi];
                      return (
                        <motion.div
                          key={wi}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: wi * 0.05 + 0.1 }}
                          className={cn("rounded-2xl border overflow-hidden", col.border)}
                        >
                          <div className={cn("px-4 py-2.5", col.bg)}>
                            <div className="flex items-center justify-between">
                              <span className={cn("text-xs font-bold", col.text)}>{wk.label}</span>
                              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", col.text, col.pill)}>{wk.range}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-[20px_1fr_50px] gap-2 px-3 py-1.5 bg-bg-elev/60 border-b border-border/30">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim">#</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim">Name</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim text-right">Score</span>
                          </div>

                          <div className="divide-y divide-border/20">
                            {(wk as any).bottom5?.length > 0 ? (
                              (wk as any).bottom5.map((f: any, i: number) => (
                                <div key={f.userId ?? f.name} className="grid grid-cols-[20px_1fr_50px] gap-2 items-center px-3 py-2 hover:bg-bg-elev/40 transition-colors">
                                  <span className="text-[9px] font-bold text-fg-muted text-center">{i + 1}</span>
                                  {getFacultyLink(f.userId) ? (
                                    <Link href={getFacultyLink(f.userId)!} className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity">
                                      <ColorAvatar name={f.name} />
                                      <span className="text-[11px] font-medium text-violet-400 hover:underline truncate">
                                        {f.name}
                                      </span>
                                    </Link>
                                  ) : (
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <ColorAvatar name={f.name} />
                                      <span className="text-[11px] font-medium text-fg truncate">{f.name}</span>
                                    </div>
                                  )}
                                  <span className="text-[12px] font-bold text-rose-400 text-right tabular-nums">{f.score?.toFixed(1) ?? f.installs ?? "—"}</span>
                                </div>
                              ))
                            ) : (
                              <div className="px-3 py-6 text-center text-[11px] text-fg-dim">No data yet</div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* COMPLETE WEEK-WISE RANKINGS VIEW */}
            {selectedCohort === "June EduSkill" && viewMode === "full" && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500 animate-pulse" />
                  <h2 className="text-sm font-bold text-violet-400 uppercase tracking-wider">Complete Week-wise Rankings</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {juneWeekData.map((wk, wi) => {
                    const col = WEEK_COLORS[wi];
                    return (
                      <motion.div
                        key={wi}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: wi * 0.05 }}
                        className={cn("rounded-2xl border overflow-hidden", col.border)}
                      >
                        {/* Week header */}
                        <div className={cn("px-4 py-2.5", col.bg)}>
                          <div className="flex items-center justify-between">
                            <span className={cn("text-xs font-bold", col.text)}>{wk.label}</span>
                            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", col.text, col.pill)}>{wk.range}</span>
                          </div>
                        </div>

                        {/* Column headers */}
                        <div className="grid grid-cols-[24px_1fr_50px] gap-2 px-3 py-1.5 bg-bg-elev/60 border-b border-border/30">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim">#</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim">Name</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-fg-dim text-right">Score</span>
                        </div>

                        {/* Scrollable list */}
                        <div className="divide-y divide-border/20 max-h-[500px] overflow-y-auto pr-1">
                          {wk.fullList && wk.fullList.length > 0 ? (
                            wk.fullList.map((f: any, i: number) => (
                              <div key={f.userId ?? f.name} className="grid grid-cols-[24px_1fr_50px] gap-2 items-center px-3 py-2 hover:bg-bg-elev/40 transition-colors">
                                <span className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                                  i === 0 ? "bg-amber-500/20 text-amber-400" :
                                  i < 3 ? "bg-bg-elev border border-border text-fg" : "text-fg-muted"
                                )}>{i + 1}</span>
                                {getFacultyLink(f.userId) ? (
                                  <Link href={getFacultyLink(f.userId)!} className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity">
                                    <ColorAvatar name={f.name} />
                                    <span className="text-[11px] font-medium text-violet-400 hover:underline truncate">
                                      {f.name}
                                    </span>
                                  </Link>
                                ) : (
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <ColorAvatar name={f.name} />
                                    <span className="text-[11px] font-medium text-fg truncate">{f.name}</span>
                                  </div>
                                )}
                                <span className="text-[12px] font-bold text-emerald-400 text-right tabular-nums">{f.score?.toFixed(1) ?? "—"}</span>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-6 text-center text-[11px] text-fg-dim">No data yet</div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Full faculty list (collapsed summary) */}
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
                <h3 className="text-sm font-semibold text-fg/90">All Faculty · Net Score Ranking</h3>
                <span className="text-[10px] rounded-full border border-border bg-bg-elev px-2.5 py-0.5">{list.length} members</span>
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-fg-muted text-center py-8">No data loaded yet</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[32px_1fr_90px_36px] gap-3 px-3 py-1.5 text-[9px] uppercase tracking-wider text-fg-dim font-bold">
                    <span>#</span><span>Faculty</span>
                    <span className="text-right">{selectedCohort === "March EduSkill" ? "Installs" : "Net Score"}</span>
                    <span className="text-right">→</span>
                  </div>
                  {list.map((f, i) => {
                    const targetLink = getFacultyLink(f.userId);
                    const content = (
                      <>
                        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold tabular-nums",
                          i === 0 ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : i < 3 ? "bg-bg-elev border border-border text-fg" : "text-fg-muted"
                        )}>{i + 1}</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <ColorAvatar name={f.name} />
                          <div className="min-w-0">
                            <span className="block text-xs font-semibold text-fg/90 truncate">{f.name}</span>
                            <span className="block text-[9px] text-fg-dim truncate">{f.email}</span>
                          </div>
                        </div>
                        <span className="text-mono text-sm font-bold text-emerald-400 text-right tabular-nums">
                          {selectedCohort === "March EduSkill" ? (f.installs ?? "—") : (f.netScore !== undefined ? f.netScore.toFixed(1) : "—")}
                        </span>
                        <span className="text-fg-dim text-right text-xs">›</span>
                      </>
                    );
                    
                    if (targetLink) {
                      return (
                        <Link
                          key={f.userId}
                          href={targetLink}
                          className="grid grid-cols-[32px_1fr_90px_36px] gap-3 items-center rounded-xl border border-border/40 bg-bg-elev/20 hover:border-border-strong hover:bg-bg-elev/50 px-3 py-2.5 transition-colors"
                        >
                          {content}
                        </Link>
                      );
                    }
                    
                    return (
                      <div
                        key={f.userId}
                        className="grid grid-cols-[32px_1fr_90px_36px] gap-3 items-center rounded-xl border border-border/40 bg-bg-elev/20 px-3 py-2.5"
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── VIDEOS TAB ── */}
        {selectedTab === "videos" && (
          <motion.div
            key="videos"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <VideoRankCard title="Top 20 Highest Rated" videos={topVideos} tone="emerald" onOpen={setOpenVideoId} />
            <VideoRankCard title="Bottom 20 Lowest Rated" videos={bottomVideos} tone="rose" onOpen={setOpenVideoId} />
          </motion.div>
        )}
      </AnimatePresence>

      <VideoDrawer
        videoId={openVideoId}
        onClose={() => setOpenVideoId(null)}
        managerMode={isManager}
        managerId={user?.userId}
        onRated={() => { juneQ.refetch(); marchQ.refetch(); }}
        hideScoring={!isManager}
      />
    </div>
  );
}

function VideoRankCard({ title, videos, tone, onOpen }: {
  title: string;
  videos: any[];
  tone: "emerald" | "rose";
  onOpen: (id: string) => void;
}) {
  const colors = tone === "emerald"
    ? { pulse: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-500/10", score: "text-emerald-400" }
    : { pulse: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/25", bg: "bg-rose-500/10", score: "text-rose-400" };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full animate-pulse", colors.pulse)} />
          <h3 className={cn("text-sm font-semibold", colors.text)}>{title}</h3>
        </div>
        <span className={cn("text-[10px] rounded-full border px-2.5 py-0.5", colors.border, colors.bg, colors.text)}>
          {videos.length} rated videos
        </span>
      </div>
      {videos.length === 0 ? (
        <p className="text-xs text-fg-muted text-center py-8">No rated videos yet</p>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-3 px-3 py-1.5 items-center text-[9px] uppercase tracking-wider text-fg-dim font-bold grid-cols-[28px_56px_1fr_70px]">
            <span>#</span><span>Thumb</span><span>Video &amp; Faculty</span><span className="text-right">Score</span>
          </div>
          {videos.map((v, i) => {
            const thumb = v.thumbnailUrl || youtubeThumb(v.youtubeUrl) || "";
            return (
              <button
                key={v.videoId}
                onClick={() => onOpen(v.videoId)}
                className="w-full grid gap-3 items-center rounded-xl border border-border/40 bg-bg-elev/20 hover:border-border-strong hover:bg-bg-elev/50 px-3 py-2 transition-colors text-left grid-cols-[28px_56px_1fr_70px] cursor-pointer"
              >
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold tabular-nums",
                  i === 0 ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : i < 3 ? "bg-bg-elev border border-border text-fg" : "text-fg-muted"
                )}>{i + 1}</span>
                <a href={v.youtubeUrl} target="_blank" rel="noopener noreferrer"
                  className="relative w-14 h-8 rounded bg-bg-elev overflow-hidden shrink-0 border border-border/40 hover:border-fg/20 transition-all group/thumb"
                  onClick={e => e.stopPropagation()}
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full bg-bg-elev flex items-center justify-center">
                      <Play className="h-3 w-3 text-fg-dim" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                    <ExternalLink className="h-3 w-3 text-white" />
                  </div>
                </a>
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-fg/90 truncate">{v.title}</span>
                  <span className="block text-[9px] text-fg-dim truncate">{v.facultyName || "Unknown"} · {v.subject}</span>
                </div>
                <span className={cn("text-sm font-bold text-right tabular-nums", colors.score)}>
                  {v.managerScore !== null && v.managerScore !== undefined ? v.managerScore.toFixed(1) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
