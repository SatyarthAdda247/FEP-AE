"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  ResponsiveContainer, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { Filter, RefreshCw, Loader2, TrendingUp, Activity, Users, Video, AlertCircle } from "lucide-react";
import type { Subject } from "@/types";
import { cn } from "@/lib/utils";

interface AnalyticsRow {
  trainee: string;
  facultyId: string;
  date: string | null;
  uploadedAt: string;
  subject: string;
  subjectId: string;
  boardWork: number | null;
  visualTLM: number | null;
  energy: number | null;
  delivery: number | null;
  hook: number | null;
  managerTotal: number | null;
  gradiScore: number | null;
  gradiContrib: number | null;
  combinedTotal: number | null;
  status: string;
  videoId: string;
}

const COLORS = {
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  sky: "#38bdf8",
  violet: "#a78bfa",
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
};

const SUBJECT_COLORS = [
  COLORS.sky, COLORS.violet, COLORS.pink, COLORS.teal, COLORS.indigo, COLORS.amber,
];

const JUNE_WEEKS = [
  { label: "Week 1", range: "08 Jun · 14 Jun", start: new Date("2026-06-08T00:00:00Z"), end: new Date("2026-06-14T23:59:59Z") },
  { label: "Week 2", range: "15 Jun · 21 Jun", start: new Date("2026-06-15T00:00:00Z"), end: new Date("2026-06-21T23:59:59Z") },
  { label: "Week 3", range: "22 Jun · 28 Jun", start: new Date("2026-06-22T00:00:00Z"), end: new Date("2026-06-28T23:59:59Z") },
  { label: "Week 4", range: "29 Jun · 08 Jul", start: new Date("2026-06-29T00:00:00Z"), end: new Date("2026-07-08T23:59:59Z") },
];

const MARCH_WEEKS = [
  { label: "Week 1", range: "06 Apr · 12 Apr", start: new Date("2026-04-06T00:00:00Z"), end: new Date("2026-04-12T23:59:59Z") },
  { label: "Week 2", range: "13 Apr · 19 Apr", start: new Date("2026-04-13T00:00:00Z"), end: new Date("2026-04-19T23:59:59Z") },
  { label: "Week 3", range: "20 Apr · 26 Apr", start: new Date("2026-04-20T00:00:00Z"), end: new Date("2026-04-26T23:59:59Z") },
  { label: "Week 4", range: "27 Apr · 03 May", start: new Date("2026-04-27T00:00:00Z"), end: new Date("2026-05-03T23:59:59Z") },
];

export function ProgramAnalytics({ subjects }: { subjects: Subject[] }) {
  const [cohort, setCohort] = useState<"June EduSkill" | "March EduSkill">("June EduSkill");
  const [facultyId, setFacultyId] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const dataQ = useQuery<{ rows: AnalyticsRow[] }>({
    queryKey: ["analytics-videolog"],
    queryFn: () => fetch("/api/archive/videolog").then(r => r.json()),
    staleTime: 30_000,
    refetchInterval: 15_000,
  });

  const cohortUsersQ = useQuery<{ leaderboard: any[] }>({
    queryKey: ["cohort-users-analytics", cohort],
    queryFn: () => fetch(`/api/stats?scope=all&cohort=${encodeURIComponent(cohort)}`).then(r => r.json()),
    staleTime: 60_000,
  });

  const allRows = dataQ.data?.rows ?? [];
  const cohortUsers = cohortUsersQ.data?.leaderboard ?? [];
  const cohortUserIds = useMemo(() => new Set(cohortUsers.map((u: any) => u.userId)), [cohortUsers]);

  // Filter distinct faculties for selection
  const faculties = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) {
      if (cohortUserIds.has(r.facultyId)) {
        m.set(r.facultyId, r.trainee);
      }
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows, cohortUserIds]);

  // Filtered rows for charts and statistics
  const rows = useMemo(() => {
    return allRows.filter(r =>
      cohortUserIds.has(r.facultyId) &&
      (facultyId === "all" || r.facultyId === facultyId) &&
      (subjectId === "all" || r.subjectId === subjectId) &&
      (statusFilter === "all" || 
        (statusFilter === "manager_rated" && r.status === "manager_rated") ||
        (statusFilter === "pending" && r.status !== "manager_rated")
      )
    );
  }, [allRows, cohortUserIds, facultyId, subjectId, statusFilter]);

  // Helper to resolve week bucket for standard charts
  const getWeekLabel = (dateStr: string | null) => {
    if (!dateStr) return "Unknown";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Unknown";
    const activeWeeks = cohort === "June EduSkill" ? JUNE_WEEKS : MARCH_WEEKS;
    for (const w of activeWeeks) {
      if (d >= w.start && d <= w.end) return w.label;
    }
    return "Week 4";
  };

  // ── Auto Analytics Grid (Weekly Trainee & Submission stats) ──
  const autoStats = useMemo(() => {
    const activeWeeks = cohort === "June EduSkill" ? JUNE_WEEKS : MARCH_WEEKS;
    const totalTrainees = cohortUsers.length || (cohort === "June EduSkill" ? 38 : 31);
    
    // Target base info
    const targetBase = {
      active: totalTrainees,
      dropoffs: 0,
      videos: cohort === "June EduSkill" ? "3/week" : "Installs-based",
      avg: cohort === "June EduSkill" ? "3+" : "N/A"
    };

    const stats = activeWeeks.map(wk => {
      // Find all videos by cohort users in this week range
      const wkVideos = allRows.filter(r => 
        cohortUserIds.has(r.facultyId) &&
        r.uploadedAt && new Date(r.uploadedAt) >= wk.start && new Date(r.uploadedAt) <= wk.end
      );

      const activeCount = new Set(wkVideos.map(v => v.facultyId)).size;
      const videosCount = wkVideos.length;
      const avgVal = activeCount > 0 ? +(videosCount / activeCount).toFixed(1) : 0;
      const dropoffsCount = Math.max(0, totalTrainees - activeCount);

      return {
        label: wk.label,
        range: wk.range,
        active: activeCount,
        dropoffs: dropoffsCount,
        videos: videosCount,
        avg: avgVal
      };
    });

    return { targetBase, stats };
  }, [allRows, cohortUserIds, cohortUsers, cohort]);

  // ── Pie: Videos by subject
  const subjectMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.subject, (m.get(r.subject) ?? 0) + 1);
    return Array.from(m, ([name, value], i) => ({
      name, value, fill: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
    }));
  }, [rows]);

  // ── Histogram: Uploads over time (per week)
  const uploadsOverTime = useMemo(() => {
    const m = new Map<string, number>();
    m.set("Week 1", 0);
    m.set("Week 2", 0);
    m.set("Week 3", 0);
    m.set("Week 4", 0);
    for (const r of rows) {
      const wk = getWeekLabel(r.date ?? r.uploadedAt);
      if (wk !== "Unknown") {
        m.set(wk, (m.get(wk) ?? 0) + 1);
      }
    }
    return Array.from(m, ([week, count]) => ({ week, count }));
  }, [rows]);

  // ── Histogram: Average per parameter (manager, grouped week-wise)
  const paramAverages = useMemo(() => {
    const weeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
    const params = ["boardWork", "visualTLM", "energy", "delivery", "hook"] as const;
    const labels = ["Board", "TLM", "Energy", "Delivery", "Hook"];
    
    return weeks.map(wk => {
      const wkRows = rows.filter(r => getWeekLabel(r.date ?? r.uploadedAt) === wk);
      const result: Record<string, any> = { week: wk };
      params.forEach((p, idx) => {
        const vals = wkRows.map(r => r[p]).filter((v): v is number => typeof v === "number");
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        result[labels[idx]] = Number(avg.toFixed(2));
      });
      return result;
    });
  }, [rows]);

  // ── Hero stats
  const stats = useMemo(() => {
    const ratedCount = rows.filter(r => r.status === "manager_rated").length;
    const mgrScores = rows.filter(r => r.managerTotal != null).map(r => r.managerTotal!);
    const avg = mgrScores.length ? mgrScores.reduce((a, b) => a + b, 0) / mgrScores.length : 0;
    return {
      total: rows.length,
      rated: ratedCount,
      avgManager: Number(avg.toFixed(2)),
      faculties: new Set(rows.map(r => r.facultyId)).size,
    };
  }, [rows]);

  const loading = dataQ.isLoading || cohortUsersQ.isLoading;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cohort & Filters Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25">
              <Activity className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-md font-semibold text-fg/90">Program Analytics Dashboard</h2>
              <p className="text-[11px] text-fg-muted">Real-time cohort performance and engagement statistics</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-bg-elev/40 p-1">
              {(["June EduSkill", "March EduSkill"] as const).map(c => (
                <button
                  key={c}
                  onClick={() => {
                    setCohort(c);
                    setFacultyId("all");
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                    cohort === c ? "bg-fg text-bg shadow-sm" : "text-fg-muted hover:text-fg"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                dataQ.refetch();
                cohortUsersQ.refetch();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-bg-elev/60 text-fg-muted hover:text-fg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap border-t border-border/40 pt-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-muted mr-2">
            <Filter className="h-3 w-3" />Filters
          </div>
          <FilterSelect
            value={facultyId}
            onChange={setFacultyId}
            options={[{ value: "all", label: "All Faculty" }, ...faculties.map(f => ({ value: f.id, label: f.name }))]}
          />
          <FilterSelect
            value={subjectId}
            onChange={setSubjectId}
            options={[{ value: "all", label: "All Subjects" }, ...subjects.map(s => ({ value: s.subjectId, label: s.name }))]}
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All Status" },
              { value: "manager_rated", label: "Manager Scored" },
              { value: "pending", label: "Uploaded / Pending" },
            ]}
          />
        </div>
      </motion.div>

      {/* ── Auto Calculated Trainee Performance Grid ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-5"
      >
        <div className="flex items-center gap-2 mb-4 border-b border-border/40 pb-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-sm font-semibold text-fg/90">Program Progress &amp; Cohort Metric Tracking</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-border/50 text-[9px] uppercase tracking-wider text-fg-dim">
                <th className="py-2.5 px-4 font-bold">Metrics</th>
                <th className="py-2.5 px-4 font-bold text-center bg-bg-elev/40 rounded-t-lg">Target/Base</th>
                {autoStats.stats.map((wk, idx) => (
                  <th key={idx} className="py-2.5 px-4 font-bold text-right">
                    <div className="flex flex-col items-end">
                      <span>{wk.label}</span>
                      <span className="text-[8px] text-fg-dim font-mono tracking-normal normal-case">{wk.range}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <tr className="hover:bg-bg-elev/20">
                <td className="py-3 px-4 font-semibold text-fg/90">Active trainees (auto)</td>
                <td className="py-3 px-4 text-center font-bold text-violet-400 bg-bg-elev/20">{autoStats.targetBase.active}</td>
                {autoStats.stats.map((wk, idx) => (
                  <td key={idx} className="py-3 px-4 text-right text-mono font-bold text-fg/80">{wk.active}</td>
                ))}
              </tr>
              <tr className="hover:bg-bg-elev/20">
                <td className="py-3 px-4 font-semibold text-fg/90">Cumulative drop-offs</td>
                <td className="py-3 px-4 text-center font-bold text-rose-400 bg-bg-elev/20">{autoStats.targetBase.dropoffs}</td>
                {autoStats.stats.map((wk, idx) => (
                  <td key={idx} className="py-3 px-4 text-right text-mono font-bold text-rose-400/90">{wk.dropoffs}</td>
                ))}
              </tr>
              <tr className="hover:bg-bg-elev/20">
                <td className="py-3 px-4 font-semibold text-fg/90">Videos submitted (auto)</td>
                <td className="py-3 px-4 text-center font-bold text-sky-400 bg-bg-elev/20">{autoStats.targetBase.videos}</td>
                {autoStats.stats.map((wk, idx) => (
                  <td key={idx} className="py-3 px-4 text-right text-mono font-bold text-fg/80">{wk.videos}</td>
                ))}
              </tr>
              <tr className="hover:bg-bg-elev/20">
                <td className="py-3 px-4 font-semibold text-fg/90">Avg videos / trainee (auto)</td>
                <td className="py-3 px-4 text-center font-bold text-emerald-400 bg-bg-elev/20">{autoStats.targetBase.avg}</td>
                {autoStats.stats.map((wk, idx) => (
                  <td key={idx} className="py-3 px-4 text-right text-mono font-bold text-emerald-400/90">{wk.avg}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Basic Stats Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Video} label="Videos" value={stats.total} color="from-sky-500/10 to-sky-600/5" border="border-sky-500/35" text="text-sky-700 dark:text-sky-400" labelText="text-sky-800/80 dark:text-sky-300/80" />
        <StatTile icon={TrendingUp} label="Avg Manager Score" value={stats.avgManager.toFixed(2)} color="from-amber-500/10 to-amber-600/5" border="border-amber-500/35" text="text-amber-700 dark:text-amber-400" labelText="text-amber-800/80 dark:text-amber-300/80" />
        <StatTile icon={Activity} label="Manager Scored" value={`${stats.rated}/${stats.total}`} color="from-emerald-500/10 to-emerald-600/5" border="border-emerald-500/35" text="text-emerald-700 dark:text-emerald-400" labelText="text-emerald-800/80 dark:text-emerald-300/80" />
        <StatTile icon={Users} label="Faculty" value={stats.faculties} color="from-violet-500/10 to-violet-600/5" border="border-violet-500/35" text="text-violet-700 dark:text-violet-400" labelText="text-violet-800/80 dark:text-violet-300/80" />
      </div>

      {rows.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center">
          <p className="text-sm text-fg-muted">No videos match the selected filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie: Videos by Subject */}
          <ChartCard title="Videos by Subject" subtitle="Subject mix">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={subjectMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  strokeWidth={0}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={10}
                >
                  {subjectMix.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Histogram: Manager parameter averages (Week-wise) */}
          <ChartCard title="Manager Parameter Averages (Week-wise)" subtitle="Mean score per parameter by week">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={paramAverages} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                <XAxis dataKey="week" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} stroke="rgba(128,128,128,0.2)" />
                <YAxis domain={[0, 5]} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} stroke="rgba(128,128,128,0.2)" />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(128,128,128,0.08)" }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Board" fill={COLORS.sky} radius={[4, 4, 0, 0]} />
                <Bar dataKey="TLM" fill={COLORS.violet} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Energy" fill={COLORS.pink} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Delivery" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Hook" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Full-width: Uploads over time */}
          <div className="lg:col-span-2">
            <ChartCard title="Uploads Over Time" subtitle="Weekly video submissions">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={uploadsOverTime} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                  <XAxis dataKey="week" tick={{ fill: "var(--fg-muted)", fontSize: 10 }} stroke="rgba(128,128,128,0.2)" />
                  <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} stroke="rgba(128,128,128,0.2)" allowDecimals={false} />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(128,128,128,0.08)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" name="Uploads" fill="var(--emerald)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function FilterSelect({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded-full border border-border bg-bg-elev/60 px-3 py-1.5 text-xs text-fg outline-none focus:border-fg/30 cursor-pointer"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function StatTile({
  icon: Icon, label, value, color, border, text, labelText
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color?: string;
  border?: string;
  text?: string;
  labelText?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cn("rounded-xl border bg-gradient-to-br p-4 shadow-sm", color || "glass", border)}
    >
      <div className={cn("flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-bold mb-1", labelText || "text-fg-muted")}>
        <Icon className="h-3.5 w-3.5" />{label}
      </div>
      <div className={cn("text-mono text-3xl font-black tracking-tight", text || "text-fg")}>{value}</div>
    </motion.div>
  );
}

function ChartCard({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-fg-muted mt-0.5">{subtitle}</p>}
      </div>
      <div style={{ width: "100%", minHeight: 240 }}>
        {children}
      </div>
    </motion.div>
  );
}

interface TooltipPayloadItem {
  name?: string;
  value?: number;
  payload?: Record<string, unknown>;
  fill?: string;
  color?: string;
}

function DarkTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border border-border px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--bg-elev)" }}
    >
      {label != null && <div className="text-fg-muted text-[10px] uppercase tracking-wider mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-fg">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.fill ?? p.color ?? "var(--emerald)" }}
          />
          <span className="text-fg-muted">{p.name ?? ""}</span>
          <span className="text-mono font-semibold ml-auto">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
