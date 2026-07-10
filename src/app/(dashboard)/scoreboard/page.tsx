"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutList, Loader2, Search,
  TrendingUp, TrendingDown, Minus,
  ChevronUp, ChevronDown, Trophy, Calendar, ArrowUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────
interface FacultyLeaderRow {
  userId: string; name: string; email: string;
  subjects: string[]; videoCount: number; netScore?: number;
}

interface ScoreRow {
  rank: number;
  userId: string;
  name: string;
  wk1: number | null; wk2: number | null;
  wk3: number | null; wk4: number | null;
  g12: number | null; g23: number | null; g34: number | null;
  total: number | null;
  filteredScore: number | null;
}

// ── Constants ──────────────────────────────────────────────────────
const JUNE_WEEKS = [
  { label: "Week 1", range: "08 Jun · 14 Jun", start: new Date("2026-06-08T00:00:00Z"), end: new Date("2026-06-14T23:59:59Z") },
  { label: "Week 2", range: "15 Jun · 21 Jun", start: new Date("2026-06-15T00:00:00Z"), end: new Date("2026-06-21T23:59:59Z") },
  { label: "Week 3", range: "22 Jun · 28 Jun", start: new Date("2026-06-22T00:00:00Z"), end: new Date("2026-06-28T23:59:59Z") },
  { label: "Week 4", range: "29 Jun · 08 Jul", start: new Date("2026-06-29T00:00:00Z"), end: new Date("2026-07-08T23:59:59Z") },
];


const AVATAR_COLORS = ["#6366f1","#8b5cf6","#ec4899","#14b8a6","#f97316","#3b82f6","#10b981","#f59e0b","#ef4444","#84cc16"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Helper to format growth delta ─────────────────────────────────
function delta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return +(b - a).toFixed(1);
}

// ── Main Page ──────────────────────────────────────────────────────
export default function ScoreboardPage() {
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<"all" | "wk1" | "wk2" | "wk3" | "wk4" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortOption, setSortOption] = useState<"highest" | "lowest">("highest");

  // ── Queries ──────────────────────────────────────────────────────
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

  const juneQ = useQuery<{ leaderboard: FacultyLeaderRow[]; videos?: any[] }>({
    queryKey: ["leaderboard-june"],
    queryFn: () => fetch("/api/stats?scope=all&cohort=June+EduSkill").then(r => r.json()),
    staleTime: 60_000,
  });

  const loading = juneQ.isLoading || meQ.isLoading;



  // ── Resolve Date Range filter ──
  const filterRange = useMemo(() => {
    if (timeFilter === "all") return null;
    if (timeFilter === "wk1") return JUNE_WEEKS[0];
    if (timeFilter === "wk2") return JUNE_WEEKS[1];
    if (timeFilter === "wk3") return JUNE_WEEKS[2];
    if (timeFilter === "wk4") return JUNE_WEEKS[3];
    if (timeFilter === "custom") {
      return {
        start: customStart ? new Date(customStart + "T00:00:00Z") : null,
        end: customEnd ? new Date(customEnd + "T23:59:59Z") : null,
      };
    }
    return null;
  }, [timeFilter, customStart, customEnd]);

  // ── Build rows with filters ──
  const allRows = useMemo<ScoreRow[]>(() => {
    const list = juneQ.data?.leaderboard ?? [];
    const videos = juneQ.data?.videos ?? [];

    const raw = list.map(f => {
      const own = videos.filter((v: any) =>
        v.facultyId === f.userId && v.managerScore != null
      );
      
      const weekScore = (s: Date, e: Date, limit: number) => {
        const vs = own.filter((v: any) => {
          const d = v.uploadedAt ? new Date(v.uploadedAt) : null;
          return d && d >= s && d <= e;
        });
        const scores = vs.map((v: any) => v.managerScore).filter((v): v is number => v != null);
        scores.sort((a, b) => b - a);
        return scores.length ? scores.slice(0, limit).reduce((acc: number, v: any) => acc + v, 0) : null;
      };

      const wk1 = weekScore(JUNE_WEEKS[0].start, JUNE_WEEKS[0].end, 1);
      const wk2 = weekScore(JUNE_WEEKS[1].start, JUNE_WEEKS[1].end, 3);
      const wk3 = weekScore(JUNE_WEEKS[2].start, JUNE_WEEKS[2].end, 3);
      const wk4 = weekScore(JUNE_WEEKS[3].start, JUNE_WEEKS[3].end, 3);
      const scores = [wk1, wk2, wk3, wk4].filter((v): v is number => v != null);
      const total = scores.length ? scores.reduce((a, b) => a + b, 0) : null;

      // Filtered total calculation
      let filteredScore: number | null = null;
      if (!filterRange) {
        filteredScore = total;
      } else {
        let sum = 0;
        let hasScoredWeek = false;
        JUNE_WEEKS.forEach((wk, wi) => {
          const wkMatchingVids = own.filter((v: any) => {
            const d = v.uploadedAt ? new Date(v.uploadedAt) : null;
            if (!d) return false;
            if (d < wk.start || d > wk.end) return false;
            if (filterRange.start && d < filterRange.start) return false;
            if (filterRange.end && d > filterRange.end) return false;
            return true;
          });

          if (wkMatchingVids.length > 0) {
            hasScoredWeek = true;
            const wkScores = wkMatchingVids.map((v: any) => v.managerScore).filter((s): s is number => s != null);
            wkScores.sort((a, b) => b - a);
            const limit = wi === 0 ? 1 : 3;
            sum += wkScores.slice(0, limit).reduce((acc, s) => acc + s, 0);
          }
        });
        filteredScore = hasScoredWeek ? sum : null;
      }

      return {
        userId: f.userId,
        name: f.name,
        wk1, wk2, wk3, wk4,
        g12: delta(wk1, wk2),
        g23: delta(wk2, wk3),
        g34: delta(wk3, wk4),
        total,
        filteredScore,
        rank: 0
      };
    });

    // Sort by filtered total according to sort option selected
    raw.sort((a, b) => {
      const scoreA = a.filteredScore ?? -Infinity;
      const scoreB = b.filteredScore ?? -Infinity;
      return sortOption === "highest" ? scoreB - scoreA : scoreA - scoreB;
    });

    return raw.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [juneQ.data, filterRange, sortOption]);

  const weekLabels = JUNE_WEEKS;

  // ── Filter by search query ──
  const filteredRows = useMemo(() => {
    return allRows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [allRows, search]);

  // ── Max score for heat bar ──
  const maxFilteredScore = Math.max(...allRows.map(r => r.filteredScore ?? 0), 1);

  // ── Summary stats ──
  const totalTrainees = allRows.length;
  const activeTrainees = allRows.filter(r => r.filteredScore != null).length;
  const avgFiltered = allRows.length
    ? +(allRows.filter(r => r.filteredScore != null).reduce((s, r) => s + (r.filteredScore ?? 0), 0) / Math.max(activeTrainees, 1)).toFixed(1)
    : 0;
  const topScore = allRows.length && sortOption === "highest" ? allRows[0]?.filteredScore ?? 0 : Math.max(...allRows.map(r => r.filteredScore ?? 0));

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-8 md:py-10 space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 border border-violet-500/20">
            <LayoutList className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">FEP · Scoreboard</h1>
            <p className="text-[11px] text-fg-muted">Week-wise net video scores + growth tracking per trainee</p>
          </div>
        </div>
      </div>

      {/* ── Filter and Custom Date Select Toolbar ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="glass-strong rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Week Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-violet-400" />
            <select
              value={timeFilter}
              onChange={e => setTimeFilter(e.target.value as any)}
              className="rounded-full border border-border bg-bg-elev/60 px-3.5 py-1.5 text-xs text-fg outline-none focus:border-violet-500/40 cursor-pointer font-medium"
            >
              <option value="all">All Time</option>
              <option value="wk1">Week 1 (08 Jun - 14 Jun)</option>
              <option value="wk2">Week 2 (15 Jun - 21 Jun)</option>
              <option value="wk3">Week 3 (22 Jun - 28 Jun)</option>
              <option value="wk4">Week 4 (29 Jun - 08 Jul)</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Custom Date Picker Fields */}
          {timeFilter === "custom" && (
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="rounded-lg border border-border bg-bg-elev/60 px-3 py-1 text-xs text-fg outline-none focus:border-violet-500/40"
              />
              <span className="text-[10px] text-fg-muted">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="rounded-lg border border-border bg-bg-elev/60 px-3 py-1 text-xs text-fg outline-none focus:border-violet-500/40"
              />
            </motion.div>
          )}

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-3.5 w-3.5 text-violet-400" />
            <select
              value={sortOption}
              onChange={e => setSortOption(e.target.value as any)}
              className="rounded-full border border-border bg-bg-elev/60 px-3.5 py-1.5 text-xs text-fg outline-none focus:border-violet-500/40 cursor-pointer font-medium"
            >
              <option value="highest">Sort: Highest Score</option>
              <option value="lowest">Sort: Lowest Score</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trainee…"
            className="rounded-full border border-border bg-bg-elev/60 pl-8 pr-3 py-1.5 text-xs text-fg outline-none focus:border-violet-500/40 w-44 placeholder:text-fg-dim"
          />
        </div>
      </motion.div>

      {/* ── Summary stat chips ── */}
      {!loading && allRows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Trainees", value: totalTrainees, color: "from-violet-500/10 to-violet-600/5", border: "border-violet-500/35", text: "text-violet-700 dark:text-violet-400", labelText: "text-violet-800/80 dark:text-violet-300/80" },
            { label: "Active Scorers", value: activeTrainees, color: "from-emerald-500/10 to-emerald-600/5", border: "border-emerald-500/35", text: "text-emerald-700 dark:text-emerald-400", labelText: "text-emerald-800/80 dark:text-emerald-300/80" },
            { label: "Top Score", value: topScore != null ? topScore.toFixed(1) : "—", color: "from-amber-500/10 to-amber-600/5", border: "border-amber-500/35", text: "text-amber-700 dark:text-amber-400", labelText: "text-amber-800/80 dark:text-amber-300/80" },
            { label: "Average Score", value: avgFiltered, color: "from-blue-500/10 to-blue-600/5", border: "border-blue-500/35", text: "text-blue-700 dark:text-blue-400", labelText: "text-blue-800/80 dark:text-blue-300/80" },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={cn("rounded-xl border bg-gradient-to-br p-4 shadow-sm", s.color, s.border)}>
              <p className={cn("text-[9px] uppercase tracking-widest font-bold mb-1", s.labelText)}>{s.label}</p>
              <p className={cn("text-3xl font-black tabular-nums tracking-tight", s.text)}>{s.value}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Main table card ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
        className="glass rounded-2xl overflow-hidden">

        {/* Card toolbar */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-sm font-semibold text-fg/90">
              {timeFilter === "all" ? "All-Time Scores" : `${timeFilter.toUpperCase()} Scores`}
            </span>
          </div>
          <span className="text-[10px] rounded-full border border-border bg-bg-elev px-2.5 py-0.5 text-fg-muted">
            {filteredRows.length} / {allRows.length} trainees
          </span>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <LayoutList className="h-8 w-8 text-fg-dim/40" />
            <p className="text-sm text-fg-muted">No scoreboard data available yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="border-b border-border/60">
                  {/* Rank */}
                  <th className="w-10 px-4 py-3 text-left">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-fg-dim">#</span>
                  </th>
                  {/* Trainee */}
                  <th className="px-4 py-3 text-left min-w-[160px]">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-fg-dim">Trainee</span>
                  </th>

                  {/* Week scores */}
                  {weekLabels.map((wk, i) => {
                    const isFilteredWeek = timeFilter === `wk${i + 1}`;
                    return (
                      <th key={i} className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={cn("text-[9px] font-bold uppercase tracking-widest transition-colors",
                            isFilteredWeek ? "text-violet-400 font-extrabold" : "text-fg-dim")}>
                            {wk.label}
                          </span>
                          <span className="text-[8px] text-fg-dim/70 font-mono">{wk.range.split(" · ")[0] ?? ""}</span>
                        </div>
                      </th>
                    );
                  })}

                  {/* Growth columns */}
                  <th className="px-3 py-3 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-fg-dim">Wk1→2</span>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-fg-dim">Wk2→3</span>
                  </th>
                  <th className="px-3 py-3 text-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-fg-dim">Wk3→4</span>
                  </th>

                  {/* Net score */}
                  <th className="px-4 py-3 text-right">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                      Net Score
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/30">
                <AnimatePresence>
                  {filteredRows.map((row, i) => {
                    const pct = ((row.filteredScore ?? 0) / maxFilteredScore) * 100;
                    return (
                      <motion.tr
                        key={row.name}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.5) }}
                        className="group hover:bg-bg-elev/40 transition-colors relative"
                      >
                        {/* Rank */}
                        <td className="px-4 py-3">
                          <span className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold tabular-nums",
                            row.rank === 1 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                            row.rank === 2 ? "bg-slate-400/10 text-slate-300 border border-slate-400/20" :
                            row.rank === 3 ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" :
                            "text-fg-dim"
                          )}>{row.rank}</span>
                        </td>

                        {/* Trainee name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {getFacultyLink(row.userId) ? (
                              <Link href={getFacultyLink(row.userId)!} className="flex items-center gap-2.5 hover:opacity-85">
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm transition-opacity"
                                  style={{ background: avatarColor(row.name) }}
                                >
                                  {row.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                  <span className="block text-[12px] font-semibold text-violet-400 hover:underline truncate leading-tight">{row.name}</span>
                                  {/* Heat bar */}
                                  <div className="mt-1 h-1 w-full max-w-[100px] rounded-full bg-bg-elev overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </Link>
                            ) : (
                              <>
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
                                  style={{ background: avatarColor(row.name) }}
                                >
                                  {row.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                  <span className="block text-[12px] font-semibold text-fg/90 truncate leading-tight">{row.name}</span>
                                  {/* Heat bar */}
                                  <div className="mt-1 h-1 w-full max-w-[100px] rounded-full bg-bg-elev overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Week scores */}
                        {([row.wk1, row.wk2, row.wk3, row.wk4] as (number | null)[]).map((v, j) => {
                          const isFilteredWeek = timeFilter === `wk${j + 1}`;
                          return (
                            <td key={j} className="px-3 py-3 text-right">
                              {v != null ? (
                                <span className={cn(
                                  "inline-flex items-center justify-center min-w-[42px] rounded-lg px-2 py-0.5 text-[12px] font-bold tabular-nums border transition-all",
                                  isFilteredWeek
                                    ? "bg-violet-500/15 border-violet-500/30 text-violet-300 shadow-sm shadow-violet-500/5 font-extrabold"
                                    : "bg-bg-elev/60 border-border/40 text-fg/85"
                                )}>
                                  {v % 1 === 0 ? v : v.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-fg-dim/40 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Growth cells */}
                        <GrowthCell value={row.g12} />
                        <GrowthCell value={row.g23} />
                        <GrowthCell value={row.g34} />

                        {/* Net Score */}
                        <td className="px-4 py-3 text-right">
                          {row.filteredScore != null ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={cn(
                                "text-[15px] font-black tabular-nums",
                                row.rank === 1 ? "text-amber-400" :
                                row.rank <= 3 ? "text-emerald-400" :
                                "text-fg/90"
                              )}>
                                {row.filteredScore % 1 === 0 ? row.filteredScore : row.filteredScore.toFixed(1)}
                              </span>
                              {row.rank === 1 && <Trophy className="h-2.5 w-2.5 text-amber-400/70" />}
                            </div>
                          ) : (
                            <span className="text-fg-dim/40 text-xs">—</span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Growth indicator cell ──────────────────────────────────────────
function GrowthCell({ value }: { value: number | null }) {
  if (value == null) {
    return <td className="px-3 py-3 text-center"><span className="text-fg-dim/30 text-xs">—</span></td>;
  }
  const pos = value > 0;
  const neg = value < 0;
  const zero = value === 0;

  return (
    <td className="px-3 py-3 text-center">
      <span className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
        pos ? "bg-emerald-500/12 text-emerald-400 border border-emerald-500/20" :
        neg ? "bg-rose-500/12 text-rose-400 border border-rose-500/20" :
              "bg-fg-dim/8 text-fg-muted border border-border/30"
      )}>
        {pos && <TrendingUp className="h-2.5 w-2.5 shrink-0" />}
        {neg && <TrendingDown className="h-2.5 w-2.5 shrink-0" />}
        {zero && <Minus className="h-2.5 w-2.5 shrink-0" />}
        <span>{pos ? "+" : ""}{value}</span>
      </span>
    </td>
  );
}
