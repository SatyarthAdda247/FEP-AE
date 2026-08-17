"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileNavBar from "@/components/MobileNavBar";
import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, Sparkles, LayoutGrid, BarChart3, Loader2, Play, Link as LinkIcon, Eye, ThumbsUp, ClipboardList, UserCheck } from "lucide-react";
import { SelectedCandidatesPanel } from "@/components/SelectedCandidates";
import { Leaderboard } from "@/components/Leaderboard";
import { VideoDrawer } from "@/components/VideoDrawer";
import { SubjectTabs } from "@/components/SubjectTabs";
import { SubjectRadar, buildRadarData } from "@/components/SubjectRadar";
import { ScoreRing } from "@/components/ScoreRing";
import { ProgramAnalytics } from "@/components/ProgramAnalytics";
import { VideoUploader } from "@/components/VideoUploader";
import { cn, extractYouTubeId, formatDate } from "@/lib/utils";
import type { Subject, Video, GradiAnalysis, JWTPayload } from "@/types";
import { SafeThumbnail } from "@/components/SafeThumbnail";

interface AggregateStats {
  leaderboard: {
    userId: string;
    name: string;
    email: string;
    subjects: string[];
    videoCount: number;
    netScore: number;
  }[];
  totalFaculty: number;
  totalVideos: number;
  totalAnalyses: number;
  totalRatings: number;
  subjectAgg: Record<string, { keys: string[]; sums: number[]; n: number }>;
}

interface FacultyStats {
  facultyId: string;
  totalVideos: number;
  netScore: number;
  pctRatedByManager: number;
  bySubject: Record<string, { count: number; videos: Video[] }>;
  videos: Video[];
}

function ManagerDashboardContent() {
  const searchParams = useSearchParams();
  const urlFacultyId = searchParams ? searchParams.get("facultyId") : null;
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [videoCountFilter, setVideoCountFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
  
  useEffect(() => {
    if (urlFacultyId) {
      setSelectedFaculty(urlFacultyId);
      // Arriving via a profile link (e.g. from Selected Candidates) —
      // the detail pane lives in the roster view
      setView("roster");
    }
  }, [urlFacultyId]);
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const [activeSubjectTab, setActiveSubjectTab] = useState("all");
  const [view, setView] = useState<"roster" | "analytics" | "rating" | "selected">("roster");
  const [activeCohort, setActiveCohort] = useState<string>("June EduSkill");

  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [videoYTStats, setVideoYTStats] = useState<Record<string, any>>({});
  const [loadingVideoYTStats, setLoadingVideoYTStats] = useState<Record<string, boolean>>({});

  async function fetchVideoYTStats(videoId: string) {
    if (videoYTStats[videoId] !== undefined) return;
    setLoadingVideoYTStats(prev => ({ ...prev, [videoId]: true }));
    try {
      const res = await fetch(`/api/videos/${videoId}/youtube-stats`);
      const data = await res.json();
      setVideoYTStats(prev => ({ ...prev, [videoId]: data }));
    } catch {
      setVideoYTStats(prev => ({ ...prev, [videoId]: null }));
    } finally {
      setLoadingVideoYTStats(prev => ({ ...prev, [videoId]: false }));
    }
  }

  function toggleExpandVideoRow(videoId: string) {
    if (expandedVideoId === videoId) {
      setExpandedVideoId(null);
    } else {
      setExpandedVideoId(videoId);
      fetchVideoYTStats(videoId);
    }
  }

  useEffect(() => {
    let saved = localStorage.getItem("selectedCohort") || "June EduSkill";
    if (saved.includes("FEP")) {
      saved = saved.replace("FEP", "EduSkill");
      localStorage.setItem("selectedCohort", saved);
    }
    setActiveCohort(saved);
    function handleCohortChange(e: Event) {
      const c = (e as CustomEvent).detail;
      setActiveCohort(c);
    }
    window.addEventListener("cohort-change", handleCohortChange);
    return () => window.removeEventListener("cohort-change", handleCohortChange);
  }, []);

  const qc = useQueryClient();

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<{ user: JWTPayload | null }> =>
      (await fetch("/api/auth/me")).json(),
  });
  const isViewer = meQ.data?.user?.role === "eduskill_viewer";

  const selectedCandidatesQ = useQuery<{ selectedUserIds: string[] }>({
    queryKey: ["selected-candidates", activeCohort],
    queryFn: () => fetch(`/api/selected-candidates?cohort=${encodeURIComponent(activeCohort)}`).then(r => r.json()),
  });

  const toggleSelectMut = useMutation({
    mutationFn: (userId: string) =>
      fetch("/api/selected-candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["selected-candidates"] }),
  });

  const subjectsQ = useQuery({
    queryKey: ["subjects"],
    queryFn: async (): Promise<{ subjects: Subject[] }> =>
      (await fetch("/api/subjects")).json(),
  });

  const aggQ = useQuery({
    queryKey: ["aggregate", activeCohort, weekFilter],
    queryFn: async (): Promise<AggregateStats> =>
      (await fetch(`/api/stats?scope=all&cohort=${encodeURIComponent(activeCohort)}&week=${weekFilter}`)).json(),
    refetchInterval: 8000,
  });

  const facultyQ = useQuery({
    queryKey: ["faculty-detail", selectedFaculty, weekFilter],
    queryFn: async (): Promise<FacultyStats> =>
      (
        await fetch(`/api/stats?facultyId=${selectedFaculty}&week=${weekFilter}`)
      ).json(),
    enabled: !!selectedFaculty,
  });

  const subjects = subjectsQ.data?.subjects ?? [];
  const subjectsByName = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.subjectId, s.name])),
    [subjects]
  );

  const filteredLeaders = useMemo(() => {
    const list = aggQ.data?.leaderboard ?? [];
    return list.filter((r) => {
      const matchSearch = search
        ? r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.email.toLowerCase().includes(search.toLowerCase())
        : true;
      const matchSubject =
        subjectFilter === "all" || r.subjects.includes(subjectFilter);

      let matchVideoCount = true;
      if (videoCountFilter === "0") {
        matchVideoCount = r.videoCount === 0;
      } else if (videoCountFilter === "1") {
        matchVideoCount = r.videoCount === 1;
      } else if (videoCountFilter === "2") {
        matchVideoCount = r.videoCount === 2;
      } else if (videoCountFilter === "3") {
        matchVideoCount = r.videoCount >= 3;
      }

      return matchSearch && matchSubject && matchVideoCount;
    });
  }, [aggQ.data, search, subjectFilter, videoCountFilter]);

  const filteredVideos = useMemo(() => {
    const list = facultyQ.data?.videos ?? [];
    if (activeSubjectTab === "all") return list;
    return list.filter((v) => v.subjectId === activeSubjectTab);
  }, [facultyQ.data, activeSubjectTab]);

  const facultySubjectTabs = useMemo(() => {
    const tabs = [
      { id: "all", label: "All", count: facultyQ.data?.totalVideos ?? 0 },
    ];
    for (const s of subjects) {
      const c = facultyQ.data?.bySubject?.[s.subjectId]?.count;
      if (c) tabs.push({ id: s.subjectId, label: s.name, count: c });
    }
    return tabs;
  }, [subjects, facultyQ.data]);

  const selectedFacultyRow = useMemo(
    () =>
      aggQ.data?.leaderboard?.find((r) => r.userId === selectedFaculty) ?? null,
    [aggQ.data, selectedFaculty]
  );

  if (meQ.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
      </div>
    );
  }

  // If March EduSkill is selected, show the March cohort dashboard
  if (activeCohort === "March EduSkill") {
    return <MarchEduSkillDashboard isViewer={isViewer} />;
  }

  return (
    <div className="mx-auto max-w-[1400px] w-full px-4 md:px-6 py-4 md:py-6 md:h-[calc(100vh-64px)] flex flex-col md:overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 md:mb-6 flex items-center justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted">
            <Sparkles className="h-3 w-3" />
            Manager Console
          </div>
          {/* View toggle — horizontally scrollable on mobile so no tab is cut off */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-bg-elev/50 p-1 overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: "roster" as const, label: "Roster", icon: LayoutGrid },
                { id: "rating" as const, label: "Rating Queue", icon: ClipboardList },
                { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
                { id: "selected" as const, label: "Selected", icon: UserCheck },
              ]
            ).map((v) => {
              const Icon = v.icon;
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] md:text-xs font-medium transition-colors isolate whitespace-nowrap shrink-0",
                    active ? "text-white dark:text-neutral-900" : "text-fg-muted hover:text-fg"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="manager-view-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-neutral-900 dark:bg-neutral-100"
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <Icon className="h-3 w-3" />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] text-fg-muted">
            <Users className="h-3 w-3" />
            <span className="text-mono text-fg/85">
              {aggQ.data?.totalFaculty ?? 0}
            </span>
            <span>faculty</span>
            <span className="text-fg-dim mx-1">·</span>
            <span className="text-mono text-fg/85">
              {aggQ.data?.totalVideos ?? 0}
            </span>
            <span>videos</span>
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {view === "analytics" ? (
          <motion.div
            key="analytics"
            className="flex-1 overflow-y-auto min-h-0 pr-1 no-scrollbar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <ProgramAnalytics subjects={subjects} />
          </motion.div>
        ) : view === "rating" ? (
          <motion.div
            key="rating"
            className="flex-1 min-h-0 overflow-hidden flex flex-col"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <JuneRatingQueue openVideoId={openVideoId} setOpenVideoId={setOpenVideoId} managerId={meQ.data?.user?.userId} onRated={() => aggQ.refetch()} cohort={activeCohort} readOnly={isViewer} />
          </motion.div>
        ) : view === "selected" ? (
          <motion.div
            key="selected"
            className="flex-1 min-h-0 overflow-hidden flex flex-col"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <SelectedCandidatesPanel cohort={activeCohort} readOnly={isViewer} />
          </motion.div>
        ) : (
          <motion.div
            key="roster"
            className="flex-1 min-h-0 overflow-hidden flex flex-col"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Top hero strip */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4 shrink-0"
            >
        <div className="glass-strong lg:col-span-2 rounded-2xl p-5 flex items-center gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-fg-muted">
              Cohort Performance
            </p>
            <h1 className="mt-1 text-xl md:text-2xl font-semibold tracking-tight">
              Adda247 EduSkill Program
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Live aggregate across all faculty and subjects.
            </p>
          </div>
        </div>
        {/* Commented out as per user request to hide Gradi
        <StatTile
          label="Analyses"
          value={aggQ.data?.totalAnalyses ?? 0}
          sub="by Gradi AI"
        />
        */}
        <StatTile
          label="Manager Ratings"
          value={aggQ.data?.totalRatings ?? 0}
          sub="submitted"
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Left: leaderboard */}
        <div className="flex flex-col h-full overflow-hidden">
          <div className="mb-3 flex flex-col gap-2 shrink-0">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search faculty..."
                className="w-full rounded-full border border-border bg-bg-elev/60 pl-9 pr-3 py-2 text-sm outline-none focus:border-fg/30"
              />
            </div>
            <div className="flex gap-2 w-full">
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="flex-1 rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none focus:border-fg/30 min-w-0"
              >
                <option value="all">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                value={videoCountFilter}
                onChange={(e) => setVideoCountFilter(e.target.value)}
                className="flex-1 rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none focus:border-fg/30 min-w-0"
              >
                <option value="all">All uploads</option>
                <option value="0">0 videos</option>
                <option value="1">1 video</option>
                <option value="2">2 videos</option>
                <option value="3">3+ videos</option>
              </select>

              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                className="flex-1 rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none focus:border-fg/30 min-w-0"
              >
                <option value="all">All Time</option>
                <option value="current">Current Week</option>
                <option value="previous">Previous Week</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 pr-1 space-y-2 no-scrollbar">
            {aggQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl shimmer border border-border"
                />
              ))}
            </div>
          ) : (
            <Leaderboard
              rows={filteredLeaders}
              onSelect={(id) => {
                setSelectedFaculty(id);
                setActiveSubjectTab("all");
              }}
              selectedId={selectedFaculty}
            />
          )}
        </div>
        </div>

        {/* Right: detail or aggregate radars */}
        <div className="h-full overflow-y-auto pr-1 no-scrollbar">
          {selectedFaculty && selectedFacultyRow ? (
            <motion.div
              key={selectedFaculty}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-5"
            >
              <div className="glass-strong rounded-2xl p-5 flex items-center gap-5">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                    Faculty Detail
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    <Link
                      href={`/faculty?facultyId=${selectedFaculty}`}
                      className="hover:underline hover:text-fg/80"
                    >
                      {selectedFacultyRow.name}
                    </Link>
                  </h2>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-fg-muted">
                    <span>{selectedFacultyRow.email}</span>
                    <span className="text-fg-dim">·</span>
                    <span>
                      {selectedFacultyRow.subjects
                        .map((s) => subjectsByName[s] ?? s)
                        .join(", ")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {(() => {
                    if (isViewer) return null;
                    const isSelected = (selectedCandidatesQ.data?.selectedUserIds ?? []).includes(selectedFaculty);
                    return (
                      <button
                        onClick={() => toggleSelectMut.mutate(selectedFaculty)}
                        disabled={toggleSelectMut.isPending}
                        title={isSelected ? "Remove from selected candidates" : "Mark as selected candidate"}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                          isSelected
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                            : "border-border text-fg-muted hover:text-emerald-500 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                        )}
                      >
                        {toggleSelectMut.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <UserCheck className="h-3.5 w-3.5" />}
                        {isSelected ? "Selected ✓" : "Select Candidate"}
                      </button>
                    );
                  })()}
                  <div className="text-right">
                    <div className="text-mono text-2xl font-semibold">
                      {facultyQ.data?.totalVideos ?? 0}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-fg-muted">
                      videos
                    </div>
                  </div>
                </div>
              </div>

              {/* Net YouTube stats for this faculty */}
              <FacultyYTStats videos={filteredVideos} facultyId={selectedFaculty ?? undefined} />

              <div className="border-b border-border pb-2">
                <SubjectTabs
                  subjects={facultySubjectTabs}
                  active={activeSubjectTab}
                  onChange={setActiveSubjectTab}
                />
              </div>

              {facultyQ.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-xl shimmer border border-border" />
                  ))}
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-bg-elev/30 py-12 text-center text-sm text-fg-muted">
                  No videos uploaded for this subject yet.
                </div>
              ) : (
                <VideoTable videos={filteredVideos} onSelect={(id) => setOpenVideoId(id)} />
              )}
            </motion.div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-dashed border-border bg-bg-elev/30 py-16 text-center">
                <p className="text-sm font-medium text-fg/85">
                  Select a faculty to drill in
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VideoDrawer
        videoId={openVideoId}
        onClose={() => setOpenVideoId(null)}
        managerMode={!isViewer}
        managerId={meQ.data?.user?.userId}
        onRated={() => {
          aggQ.refetch();
          if (selectedFaculty) facultyQ.refetch();
        }}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass rounded-2xl p-5"
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-fg-muted">
        {label}
      </p>
      <p className="mt-2 text-mono text-3xl font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-fg-dim">{sub}</p>
    </motion.div>
  );
}

interface YTStats {
  views: number;
  likes: number;
  comments: number;
  duration: string;
  publishedAt: string;
}

function VideoTable({ videos, onSelect }: { videos: (Video & { analysis?: GradiAnalysis | null })[]; onSelect: (id: string) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, YTStats | null>>({});
  const [loadingStats, setLoadingStats] = useState<Record<string, boolean>>({});
  const [ratingFilter, setRatingFilter] = useState<"all" | "rated" | "unrated">("all");

  const filteredVideos = videos.filter(v => {
    if (ratingFilter === "rated") return v.status === "manager_rated";
    if (ratingFilter === "unrated") return v.status !== "manager_rated";
    return true;
  });

  async function fetchStats(videoId: string) {
    if (stats[videoId] !== undefined) return;
    setLoadingStats(prev => ({ ...prev, [videoId]: true }));
    try {
      const res = await fetch(`/api/videos/${videoId}/youtube-stats`);
      const data = await res.json();
      setStats(prev => ({ ...prev, [videoId]: data }));
    } catch {
      setStats(prev => ({ ...prev, [videoId]: null }));
    } finally {
      setLoadingStats(prev => ({ ...prev, [videoId]: false }));
    }
  }

  function toggleExpand(videoId: string) {
    if (expandedId === videoId) {
      setExpandedId(null);
    } else {
      setExpandedId(videoId);
      fetchStats(videoId);
    }
  }

  return (
    <div className="space-y-3">
      {/* Scoring status filter */}
      <div className="flex items-center gap-1">
        {(["all", "unrated", "rated"] as const).map(f => (
          <button key={f} onClick={() => setRatingFilter(f)}
            className={cn("px-3 py-1 rounded-full text-[11px] font-medium transition-colors",
              ratingFilter === f ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "text-fg-muted border border-border hover:text-fg")}>
            {f === "all" ? `All (${videos.length})` : f === "unrated" ? `Unscored (${videos.filter(v => v.status !== "manager_rated").length})` : `Scored (${videos.filter(v => v.status === "manager_rated").length})`}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[88px_1fr_80px_70px_70px_60px] gap-2 px-4 py-2.5 bg-bg-elev/50 border-b border-border text-[10px] uppercase tracking-[0.15em] text-fg-muted font-medium">
        <span></span>
        <span>Title</span>
        {/* <span className="text-center">Gradi /25</span> */}
        <span className="text-center">Manager</span>
        <span className="text-center">Status</span>
        <span className="text-center">Stats</span>
        <span className="text-center">Score</span>
      </div>

      {/* Rows */}
      {filteredVideos.map((v) => {
        const gradiScore = v.analysis?.gradiScore ?? 0;
        const isExpanded = expandedId === v.videoId;
        const vStats = stats[v.videoId];
        const isLoadingRow = loadingStats[v.videoId];
        const thumbUrl = v.thumbnailUrl || (v.youtubeUrl ? `https://img.youtube.com/vi/${extractYouTubeId(v.youtubeUrl)}/default.jpg` : null);

        return (
          <div key={v.videoId}>
            <div
              className="grid grid-cols-[88px_1fr_80px_70px_70px_60px] gap-2 px-4 py-2.5 border-b border-border hover:bg-bg-elev/30 transition-colors items-center"
            >
              {/* Thumbnail */}
              <div className="w-20 h-14 rounded-md overflow-hidden bg-bg-elev flex-shrink-0">
                <SafeThumbnail
                  src={thumbUrl || undefined}
                  alt=""
                  className="w-full h-full object-cover"
                  iconSize={12}
                />
              </div>

              {/* Title */}
              <div className="min-w-0 cursor-pointer" onClick={() => toggleExpand(v.videoId)}>
                <p className="text-sm font-medium text-fg truncate">{v.title}</p>
                <p className="text-[10px] text-fg-muted mt-0.5">
                  {v.subject} · {formatDate(v.uploadedAt)}
                  {v.views !== undefined && ` · ${v.views} views`}
                  {v.likes !== undefined && ` · ${v.likes} likes`}
                  {v.duration && ` · ${v.duration}`}
                </p>
              </div>

              {/* Gradi score /25 (commented out) */}
              {/*
              <div className="text-center">
                {gradiScore > 0 ? (
                  <span className="text-mono text-sm font-semibold" style={{ color: gradiScore >= 4 ? "var(--emerald)" : gradiScore >= 3 ? "var(--amber)" : "var(--fg-muted)" }}>
                  {(gradiScore * 5).toFixed(1)}<span className="text-[9px] text-fg-dim font-normal">/25</span>
                  </span>
                ) : <span className="text-[10px] text-fg-dim">—</span>}
              </div>
              */}

              <div className="text-center">
                {(v as any).managerRating?.total !== undefined ? (
                  <div className="flex flex-col items-center">
                    <span className="text-mono text-sm font-semibold text-fg">
                      {(v as any).managerRating.total.toFixed(1)}<span className="text-[9px] text-fg-dim font-normal">/25</span>
                    </span>
                    {(v as any).managerRating.managerName && (
                      <span className="text-[9px] text-emerald-400 font-medium truncate max-w-[80px]" title={`Rated by ${(v as any).managerRating.managerName}`}>
                        by {(v as any).managerRating.managerName.split(" ")[0]}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-fg-dim">pending</span>
                )}
              </div>

              {/* Status */}
              <div className="text-center">
                <span className={cn(
                  "inline-block px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-medium",
                  v.status === "manager_rated" ? "bg-emerald-500/10 text-emerald-400" :
                  v.status === "gradi_done" ? "bg-blue-500/10 text-blue-400" :
                  v.status === "analyzing" ? "bg-amber-500/10 text-amber-400" :
                  "bg-fg/5 text-fg-muted"
                )}>
                  {v.status === "manager_rated" ? "done" : "pending"}
                </span>
              </div>

              {/* Stats toggle */}
              <div className="text-center">
                <button
                  onClick={() => toggleExpand(v.videoId)}
                  className={cn(
                    "text-[10px] font-medium px-2 py-1 rounded-full border transition-colors",
                    isExpanded ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-fg-muted hover:text-fg hover:border-border-strong"
                  )}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
              </div>

              {/* Score button */}
              <div className="text-center">
                <button
                  onClick={() => onSelect(v.videoId)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-fg text-bg hover:opacity-80 transition-opacity"
                >
                  Score
                </button>
              </div>
            </div>

            {/* Expandable analytics row */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden border-b border-border bg-bg-elev/20"
                >
                  <div className="px-4 py-4">
                    {isLoadingRow ? (
                      <div className="flex items-center gap-2 text-xs text-fg-muted">
                        <Loader2 className="h-3 w-3 animate-spin" /> Fetching YouTube analytics...
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row gap-4 items-start">
                        {/* Zoomed fully visible thumbnail */}
                        <div className="w-full md:w-56 shrink-0 aspect-video rounded-xl border border-border overflow-hidden bg-bg-elev shadow-md">
                          <SafeThumbnail
                            src={thumbUrl || undefined}
                            alt=""
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                            iconSize={20}
                          />
                        </div>

                        {vStats ? (
                          <div className="flex-1 space-y-3 w-full">
                            <p className="text-[10px] uppercase tracking-[0.15em] text-fg-muted font-medium">YouTube Analytics</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="rounded-lg border border-border bg-bg p-3">
                                <p className="text-[10px] uppercase tracking-wider text-fg-muted">Views</p>
                                <p className="text-mono text-lg font-bold text-fg mt-0.5">{vStats.views.toLocaleString()}</p>
                              </div>
                              <div className="rounded-lg border border-border bg-bg p-3">
                                <p className="text-[10px] uppercase tracking-wider text-fg-muted">Likes</p>
                                <p className="text-mono text-lg font-bold text-fg mt-0.5">{vStats.likes.toLocaleString()}</p>
                              </div>
                              <div className="rounded-lg border border-border bg-bg p-3">
                                <p className="text-[10px] uppercase tracking-wider text-fg-muted">Comments</p>
                                <p className="text-mono text-lg font-bold text-fg mt-0.5">{vStats.comments.toLocaleString()}</p>
                              </div>
                              <div className="rounded-lg border border-border bg-bg p-3">
                                <p className="text-[10px] uppercase tracking-wider text-fg-muted">Duration</p>
                                <p className="text-mono text-lg font-bold text-fg mt-0.5">{vStats.duration || "—"}</p>
                              </div>
                            </div>
                            {vStats.publishedAt && (
                              <p className="text-[10px] text-fg-dim">Published: {new Date(vStats.publishedAt).toLocaleDateString()}</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 py-4 text-xs text-fg-muted">
                            Failed to load YouTube stats, but you can evaluate the thumbnail above.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function JuneRatingQueue({ openVideoId, setOpenVideoId, managerId, onRated, cohort, readOnly }: { openVideoId: string | null; setOpenVideoId: (id: string | null) => void; managerId?: string; onRated: () => void; cohort?: string; readOnly?: boolean }) {
  const [ratingFilter, setRatingFilter] = useState<"unrated" | "rated" | "all">("unrated");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [facultyFilter, setFacultyFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "faculty" | "subject">("newest");

  // Fetch cohort faculty to filter videos
  const cohortQ = useQuery({
    queryKey: ["cohorts-ids", cohort],
    queryFn: async () => {
      const res = await fetch(`/api/cohorts?cohort=${encodeURIComponent(cohort ?? "June EduSkill")}`);
      return res.json() as Promise<{ faculty: { userId: string }[] }>;
    },
  });

  const videosQ = useQuery<{ videos: (Video & { managerRating?: any })[] }>({
    queryKey: ["all-videos-raw"],
    queryFn: () => fetch("/api/videos?scope=all").then(r => r.json()),
  });

  const subjectsQ = useQuery<{ subjects: Subject[] }>({
    queryKey: ["subjects"],
    queryFn: () => fetch("/api/subjects").then(r => r.json()),
  });

  const allVideos = useMemo(() => {
    const raw = videosQ.data?.videos ?? [];
    const facultyIds = new Set(cohortQ.data?.faculty.map(f => f.userId) ?? []);
    if (facultyIds.size === 0) return [];
    return raw.filter(v => facultyIds.has(v.facultyId));
  }, [videosQ.data, cohortQ.data]);

  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, string>();
    allVideos.forEach(v => { if (v.subjectId && v.subject) map.set(v.subjectId, v.subject); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allVideos]);

  const uniqueFaculty = useMemo(() => {
    const map = new Map<string, string>();
    allVideos.forEach(v => { if (v.facultyId && v.facultyName) map.set(v.facultyId, v.facultyName); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allVideos]);

  const filtered = useMemo(() => {
    let list = allVideos.filter(v => {
      if (ratingFilter === "unrated") return v.status !== "manager_rated";
      if (ratingFilter === "rated")   return v.status === "manager_rated";
      return true;
    });
    if (subjectFilter !== "all") list = list.filter(v => v.subjectId === subjectFilter);
    if (facultyFilter !== "all") list = list.filter(v => v.facultyId === facultyFilter);
    return [...list].sort((a, b) => {
      if (sortBy === "newest")  return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      if (sortBy === "oldest")  return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      if (sortBy === "faculty") return (a.facultyName ?? "").localeCompare(b.facultyName ?? "");
      if (sortBy === "subject") return (a.subject ?? "").localeCompare(b.subject ?? "");
      return 0;
    });
  }, [allVideos, ratingFilter, subjectFilter, facultyFilter, sortBy]);

  const unratedCount  = allVideos.filter(v => v.status !== "manager_rated").length;
  const ratedCount    = allVideos.filter(v => v.status === "manager_rated").length;
  const hasActiveFilter = subjectFilter !== "all" || facultyFilter !== "all" || sortBy !== "newest";

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Scoring Queue</h2>
          <p className="text-[11px] text-fg-muted mt-0.5">
            Showing <span className="font-medium text-fg">{filtered.length}</span> of {allVideos.length} videos
            {unratedCount > 0 && <> · <span className="text-amber-400 font-medium">{unratedCount} unscored</span></>}
          </p>
        </div>
        {hasActiveFilter && (
          <button
            onClick={() => { setSubjectFilter("all"); setFacultyFilter("all"); setSortBy("newest"); }}
            className="text-[11px] text-fg-muted border border-border rounded-full px-3 py-1 hover:text-fg hover:border-border-strong transition-colors"
          >
            ✕ Reset filters
          </button>
        )}
      </div>

      {/* Status pills row */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["unrated", "rated", "all"] as const).map(f => (
          <button key={f} onClick={() => setRatingFilter(f)}
            className={cn("px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors",
              ratingFilter === f
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-fg-muted border border-border hover:text-fg")}>
            {f === "unrated" ? `Unscored (${unratedCount})` : f === "rated" ? `Scored (${ratedCount})` : `All (${allVideos.length})`}
          </button>
        ))}
      </div>

      {/* Advanced filter bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-bg-elev/30 px-4 py-3">
        {/* Subject */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-fg-muted font-semibold whitespace-nowrap">Subject</span>
          <select
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
            className="rounded-full border border-border bg-bg-elev text-xs text-fg px-3 py-1 outline-none focus:border-fg/30 cursor-pointer"
          >
            <option value="all">All subjects</option>
            {uniqueSubjects.map(([id, name]) => (
              <option key={id} value={id}>
                {name} ({allVideos.filter(v => v.subjectId === id).length})
              </option>
            ))}
          </select>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Faculty */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-fg-muted font-semibold whitespace-nowrap">Faculty</span>
          <select
            value={facultyFilter}
            onChange={e => setFacultyFilter(e.target.value)}
            className="rounded-full border border-border bg-bg-elev text-xs text-fg px-3 py-1 outline-none focus:border-fg/30 cursor-pointer"
          >
            <option value="all">All faculty</option>
            {uniqueFaculty.map(([id, name]) => (
              <option key={id} value={id}>
                {name} ({allVideos.filter(v => v.facultyId === id).length})
              </option>
            ))}
          </select>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Gradi analysis status (commented out as per user request) */}
        {/*
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-fg-muted font-semibold whitespace-nowrap">Gradi AI</span>
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-bg-elev p-0.5">
            {([
              { v: "all",      label: "Any" },
              { v: "analyzed", label: "✓ Done" },
              { v: "pending",  label: "⏳ Pending" },
            ] as const).map(opt => (
              <button
                key={opt.v}
                onClick={() => setGradiFilter(opt.v)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap",
                  gradiFilter === opt.v
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-fg-muted hover:text-fg"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        */}

        <div className="h-4 w-px bg-border" />

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-fg-muted font-semibold whitespace-nowrap">Sort</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-full border border-border bg-bg-elev text-xs text-fg px-3 py-1 outline-none focus:border-fg/30 cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="faculty">Faculty A→Z</option>
            <option value="subject">Subject A→Z</option>
          </select>
        </div>
      </div>

      {/* Video list */}
      {(videosQ.isLoading || cohortQ.isLoading) ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-fg-muted" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-bg-elev/30 py-12 text-center text-sm text-fg-muted">
          {!hasActiveFilter && ratingFilter === "unrated" ? "All videos scored! 🎉" : "No videos match the current filters"}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 no-scrollbar">
          <div className="glass rounded-2xl overflow-hidden">
          {/* Column header — desktop only; mobile uses stacked cards */}
          <div className="hidden md:grid grid-cols-[88px_1fr_160px_100px_60px] gap-2 px-4 py-2.5 bg-bg-elev/50 border-b border-border text-[10px] uppercase tracking-[0.15em] text-fg-muted font-medium">
            <span></span>
            <span>Video</span>
            <span>Faculty</span>
            <span className="text-center">Status</span>
            <span className="text-center">Score</span>
          </div>
          {filtered.map(v => (
            <div key={v.videoId} className="flex flex-col gap-3 px-4 py-3 border-b border-border/50 hover:bg-bg-elev/30 transition-colors md:grid md:grid-cols-[88px_1fr_160px_100px_60px] md:gap-2 md:py-2.5 md:items-center">
              {/* Thumbnail + title/meta (+faculty on mobile). md:contents promotes children to grid cells on desktop */}
              <div className="flex gap-3 md:contents">
                <div className="w-24 h-16 md:w-20 md:h-14 rounded-md overflow-hidden bg-bg-elev flex-shrink-0">
                  <SafeThumbnail src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" iconSize={12} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg line-clamp-2 md:truncate">{v.title}</p>
                  <p className="text-[11px] md:text-[10px] text-fg-muted mt-0.5">
                    {v.subject} · {formatDate(v.uploadedAt)}
                    {v.views !== undefined && ` · ${v.views} views`}
                    {v.likes !== undefined && ` · ${v.likes} likes`}
                    {v.duration && ` · ${v.duration}`}
                  </p>
                  <p className="md:hidden text-[11px] text-fg-muted mt-0.5 truncate">{v.facultyName ?? "—"}</p>
                </div>
              </div>
              {/* Faculty — desktop column only */}
              <span className="hidden md:block text-[11px] text-fg-muted truncate">{v.facultyName ?? "—"}</span>
              {/* Status + Score — a row on mobile, two grid cells on desktop */}
              <div className="flex items-center justify-between gap-2 md:contents">
                <div className="md:text-center">
                  <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] md:text-[9px] uppercase tracking-wider font-medium",
                    v.status === "manager_rated" ? "bg-emerald-500/10 text-emerald-400" : "bg-fg/5 text-fg-muted"
                  )}>
                    {v.status === "manager_rated" ? "done" : "pending"}
                  </span>
                </div>
                <div className="md:text-center">
                  <button
                    onClick={() => setOpenVideoId(v.videoId)}
                    className={cn(
                      "text-xs font-semibold px-4 py-2 md:px-3 md:py-1.5 rounded-lg transition-colors border",
                      v.status === "manager_rated"
                        ? "border-border bg-bg-elev/40 hover:bg-bg-elev text-fg"
                        : "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-80"
                    )}
                  >
                    {(v as any).managerRating?.total !== undefined ? `${(v as any).managerRating.total.toFixed(1)}/25` : (readOnly ? "View" : "Score")}
                  </button>
                  {(v as any).managerRating?.managerName && (
                    <p className="text-[9px] text-emerald-400 font-medium mt-1 truncate max-w-[80px] md:mx-auto" title={`Rated by ${(v as any).managerRating.managerName}`}>
                      by {(v as any).managerRating.managerName.split(" ")[0]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      )}

      <VideoDrawer videoId={openVideoId} onClose={() => setOpenVideoId(null)} managerMode={!readOnly} managerId={managerId} onRated={() => { onRated(); videosQ.refetch(); }} />
    </div>
  );
}

// CohortView component removed.

function MarchEduSkillDashboard({ isViewer = false }: { isViewer?: boolean }) {
  const TARGET_INSTALLS = 100;
  const searchParams = useSearchParams();
  const urlFacultyId = searchParams ? searchParams.get("facultyId") : null;
  
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [videoCountFilter, setVideoCountFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  // Profile edit fields
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editSubjects, setEditSubjects] = useState<string[]>([]);
  const [editAvatar, setEditAvatar] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editTeachingSubject, setEditTeachingSubject] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);

  const aggQ = useQuery({
    queryKey: ["aggregate", "March EduSkill", weekFilter],
    queryFn: async (): Promise<any> =>
      (await fetch(`/api/stats?scope=all&cohort=${encodeURIComponent("March EduSkill")}&week=${weekFilter}`)).json(),
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (urlFacultyId) {
      setSelectedFaculty(urlFacultyId);
    }
  }, [urlFacultyId]);

  const cohortQ = useQuery({
    queryKey: ["cohorts", "March EduSkill"],
    queryFn: async () => {
      const res = await fetch(`/api/cohorts?cohort=${encodeURIComponent("March EduSkill")}`);
      return res.json() as Promise<{ faculty: any[]; total: number }>;
    },
  });

  const subjectsQ = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const res = await fetch("/api/subjects");
      return res.json() as Promise<{ subjects: Subject[] }>;
    },
  });

  const adjustQ = useQuery({
    queryKey: ["adjust-stats", weekFilter],
    queryFn: async () => {
      const faculty = cohortQ.data?.faculty ?? [];
      const tokens = faculty.filter(f => f.adjustToken).map(f => f.adjustToken!);
      if (tokens.length === 0) return { networks: [], totals: { installs: 0, clicks: 0, sessions: 0, reattributions: 0 } };
      
      const params = new URLSearchParams({ trackers: tokens.join(",") });
      if (weekFilter !== "all") {
        params.set("week", weekFilter);
      }
      const res = await fetch(`/api/adjust?${params.toString()}`);
      return res.json() as Promise<any>;
    },
    enabled: !!cohortQ.data?.faculty?.length,
  });

  const facultyList = cohortQ.data?.faculty ?? [];
  const subjects = subjectsQ.data?.subjects ?? [];
  
  const selectedFacultyData = useMemo(() => {
    return facultyList.find(f => f.userId === selectedFaculty) ?? null;
  }, [facultyList, selectedFaculty]);

  // Set profile edit values when selected faculty changes
  useEffect(() => {
    if (selectedFacultyData) {
      setEditName(selectedFacultyData.name || "");
      setEditAge(selectedFacultyData.age ? String(selectedFacultyData.age) : "");
      setEditDob(selectedFacultyData.dob || "");
      setEditSubjects(selectedFacultyData.subjects || []);
      setEditAvatar(selectedFacultyData.avatarUrl || "");
      setEditGender(selectedFacultyData.gender || "");
      setEditTeachingSubject(selectedFacultyData.teachingSubject || "");
      setIsEditingProfile(false);
    }
  }, [selectedFacultyData]);

  const totals = adjustQ.data?.totals ?? { installs: 0, clicks: 0, sessions: 0, reattributions: 0 };
  const networks = adjustQ.data?.networks ?? [];

  function getFacultyStats(email: string) {
    const prefix = email.split("@")[0].toLowerCase();
    const match = networks.find((n: any) => n.network.toLowerCase().includes(prefix));
    if (match) return match;
    return {
      installs: 0,
      clicks: 0,
      sessions: 0
    };
  }

  const filteredFaculty = useMemo(() => {
    return facultyList.filter(f => {
      const matchSearch = search ? f.name.toLowerCase().includes(search.toLowerCase()) || f.email.toLowerCase().includes(search.toLowerCase()) : true;
      const matchSub = subjectFilter === "all" || (f.subjects || []).includes(subjectFilter);
      return matchSearch && matchSub;
    });
  }, [facultyList, search, subjectFilter]);

  // Fetch videos for the selected faculty
  const videosQ = useQuery({
    queryKey: ["march-faculty-videos", selectedFaculty, weekFilter],
    queryFn: async () => {
      const res = await fetch(`/api/videos?facultyId=${selectedFaculty}&week=${weekFilter}`);
      return res.json() as Promise<{ videos: Video[] }>;
    },
    enabled: !!selectedFaculty,
  });

  const videos = videosQ.data?.videos ?? [];

  const leaderboardRows = useMemo(() => {
    const list = aggQ.data?.leaderboard ?? [];
    return list.filter((r: any) => {
      const matchSearch = search ? r.name.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase()) : true;
      const matchSub = subjectFilter === "all" || (r.subjects || []).includes(subjectFilter);
      
      let matchVideoCount = true;
      if (videoCountFilter === "0") {
        matchVideoCount = r.videoCount === 0;
      } else if (videoCountFilter === "1") {
        matchVideoCount = r.videoCount === 1;
      } else if (videoCountFilter === "2") {
        matchVideoCount = r.videoCount === 2;
      } else if (videoCountFilter === "3") {
        matchVideoCount = r.videoCount >= 3;
      }

      return matchSearch && matchSub && matchVideoCount;
    }).sort((a: any, b: any) => b.installs - a.installs);
  }, [aggQ.data, search, subjectFilter, videoCountFilter]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedFaculty,
          name: editName,
          age: editAge ? Number(editAge) : undefined,
          dob: editDob || undefined,
          subjects: editSubjects,
          avatarUrl: editAvatar || undefined,
          gender: editGender || undefined,
          teachingSubject: editTeachingSubject || undefined,
        }),
      });
      if (res.ok) {
        cohortQ.refetch();
        setIsEditingProfile(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleDeleteVideo(videoId: string) {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        videosQ.refetch();
        cohortQ.refetch();
      }
    } catch (err) {
      console.error(err);
    }
  }

  const totalTarget = facultyList.filter(f => f.adjustToken).length * TARGET_INSTALLS;
  const totalClicks = totals.clicks;
  const totalInstalls = totals.installs;
  const totalSessions = totals.sessions;

  return (
    <div className="mx-auto max-w-[1400px] w-full px-6 py-6 h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted">
              <Sparkles className="h-3 w-3" />
              March EduSkill Cohort
            </div>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight font-sans">App Install & Engagement Tracking</h1>
          <p className="text-sm text-fg-muted mt-1">Attribution details and custom profile management for March EduSkill faculty</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6 flex-1 min-h-0 overflow-hidden">
        {/* LEFT: Leaderboard */}
        <div className="flex flex-col h-full overflow-hidden">
          <div className="mb-3 flex flex-col gap-2 shrink-0">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search March faculty..."
                className="w-full rounded-full border border-border bg-bg-elev/60 pl-9 pr-3 py-2 text-sm outline-none focus:border-fg/30"
              />
            </div>
            <div className="flex gap-2 w-full">
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="flex-1 rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none focus:border-fg/30 min-w-0"
              >
                <option value="all">All verticals</option>
                {subjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>{s.name}</option>
                ))}
              </select>

              <select
                value={videoCountFilter}
                onChange={(e) => setVideoCountFilter(e.target.value)}
                className="flex-1 rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none focus:border-fg/30 min-w-0"
              >
                <option value="all">All uploads</option>
                <option value="0">0 videos</option>
                <option value="1">1 video</option>
                <option value="2">2 videos</option>
                <option value="3">3+ videos</option>
              </select>

              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                className="flex-1 rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none focus:border-fg/30 min-w-0"
              >
                <option value="all">All Time</option>
                <option value="current">Current Week</option>
                <option value="previous">Previous Week</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-2 no-scrollbar">
            {cohortQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl shimmer border border-border" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboardRows.map((row: any, i: number) => {
                const isSelected = selectedFaculty === row.userId;
                return (
                  <motion.button
                    key={row.userId}
                    whileHover={{ x: 2 }}
                    onClick={() => setSelectedFaculty(row.userId)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                      isSelected ? "border-fg/30 bg-bg-elev/80" : "border-border bg-bg-elev/40 hover:border-border-strong hover:bg-bg-elev/70"
                    )}
                  >
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-mono text-xs font-semibold shrink-0",
                      i === 0 ? "bg-amber-500/15 text-amber-500 border border-amber-500/30" : "bg-bg-elev text-fg-muted border border-border"
                    )}>{i + 1}</div>
                    
                    <div className="h-8 w-8 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-fg/30 to-fg/5 flex items-center justify-center border border-border/60">
                      {row.avatarUrl ? (
                        <img src={row.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-fg/80">{row.name.split(" ").map((s: string) => s[0]).slice(0,2).join("")}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{row.name}</p>
                      <p className="text-[10px] text-fg-muted truncate">{row.email}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/* RIGHT: Detail pane */}
        <div className="h-full overflow-y-auto pr-1 no-scrollbar">
          {selectedFaculty && selectedFacultyData ? (
            <div className="space-y-5">
              {/* Profile Card & Editor */}
              <div className="glass-strong rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full overflow-hidden bg-bg-elev border border-border flex items-center justify-center shrink-0">
                      {selectedFacultyData.avatarUrl ? (
                        <img src={selectedFacultyData.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold">{selectedFacultyData.name.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-fg-muted font-mono">Faculty Profile</p>
                      <h2 className="text-xl font-semibold tracking-tight mt-0.5">{selectedFacultyData.name}</h2>
                      <p className="text-xs text-fg-muted mt-0.5">{selectedFacultyData.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsEditingProfile(p => !p)}
                    className="rounded-lg border border-border hover:border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg transition-colors cursor-pointer"
                  >
                    {isEditingProfile ? "Cancel" : "Edit Profile"}
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {isEditingProfile ? (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4 pt-4 border-t border-border">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1 font-semibold">Name</label>
                          <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs outline-none focus:border-fg/30" />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1 font-semibold">Age</label>
                          <input type="number" value={editAge} onChange={e => setEditAge(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs outline-none focus:border-fg/30" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1 font-semibold">Date of Birth (DOB)</label>
                          <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs outline-none focus:border-fg/30 text-white" />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1 font-semibold">Profile Photo</label>
                          <input type="file" accept="image/*" onChange={handlePhotoUpload} className="w-full text-xs text-fg-muted file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[11px] file:font-semibold file:bg-bg-elev file:text-fg hover:file:opacity-80 cursor-pointer" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1 font-semibold">Gender</label>
                          <select value={editGender} onChange={e => setEditGender(e.target.value)} className="w-full rounded-lg border border-border bg-[#181a20] px-3 py-2 text-xs outline-none focus:border-fg/30 text-white">
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1 font-semibold">Subject (Teaching)</label>
                          <input type="text" value={editTeachingSubject} onChange={e => setEditTeachingSubject(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs outline-none focus:border-fg/30" placeholder="e.g. Maths, Physics" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-fg-muted mb-1 font-semibold">Customize Subjects</label>
                        <div className="grid grid-cols-3 gap-2 border border-border rounded-xl p-3 bg-bg max-h-40 overflow-y-auto">
                          {subjects.map(sub => {
                            const active = editSubjects.includes(sub.subjectId);
                            return (
                              <label key={sub.subjectId} className="flex items-center gap-2 text-[11px] text-fg-muted cursor-pointer hover:text-fg">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => {
                                    setEditSubjects(prev =>
                                      active ? prev.filter(x => x !== sub.subjectId) : [...prev, sub.subjectId]
                                    );
                                  }}
                                  className="rounded border-border"
                                />
                                <span className="truncate">{sub.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {editAvatar && (
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-fg-muted uppercase">Preview:</span>
                          <img src={editAvatar} alt="" className="h-10 w-10 rounded-full object-cover border border-border" />
                          <button onClick={() => setEditAvatar("")} className="text-[10px] text-rose-500 hover:underline">Remove</button>
                        </div>
                      )}

                      <button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className="w-full rounded-lg bg-white text-black py-2 text-xs font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {savingProfile && <Loader2 className="h-3 w-3 animate-spin" />}
                        Save Profile Changes
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-3 gap-4 pt-4 border-t border-border/60">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-fg-muted font-mono">Age</p>
                        <p className="text-sm font-semibold mt-0.5">{selectedFacultyData.age ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-fg-muted font-mono">Date of Birth</p>
                        <p className="text-sm font-semibold mt-0.5">{selectedFacultyData.dob ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-fg-muted font-mono">Custom Verticals</p>
                        <p className="text-sm font-semibold mt-0.5 truncate">
                          {selectedFacultyData.subjects?.map((s: string) => subjects.find(x => x.subjectId === s)?.name ?? s).join(", ") || "None selected"}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Performance Metrics */}
              {(() => {
                const stats = getFacultyStats(selectedFacultyData.email);
                const selectedFacultyRow = aggQ.data?.leaderboard?.find((r: any) => r.userId === selectedFaculty);
                const views = selectedFacultyRow ? selectedFacultyRow.views : videos.reduce((acc: number, v: any) => acc + (v.views || 0), 0);
                const subscribersGained = selectedFacultyRow ? selectedFacultyRow.subscribersGained : (Math.floor(stats.installs * 0.4) + Math.floor(views * 0.02));
                
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="glass rounded-xl p-4">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-fg-muted font-mono">Installs</p>
                      <p className="text-mono text-xl font-bold mt-1.5 text-emerald-400">{stats.installs}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-fg-muted font-mono">Link Clicks</p>
                      <p className="text-mono text-xl font-bold mt-1.5 text-blue-400">{stats.clicks}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-fg-muted font-mono">Views</p>
                      <p className="text-mono text-xl font-bold mt-1.5 text-sky-400">{views}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Video List & Upload */}
              <div className="glass rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold tracking-tight">Videos Log</h3>
                </div>

                {videosQ.isLoading ? (
                  <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-fg-muted" /></div>
                ) : videos.length === 0 ? (
                  <p className="text-xs text-fg-muted text-center py-6">No videos uploaded yet.</p>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className={cn(
                      "grid gap-2 px-4 py-2 bg-bg-elev/50 border-b border-border text-[9px] uppercase tracking-wider font-semibold text-fg-muted",
                      isViewer ? "grid-cols-[80px_1fr_120px]" : "grid-cols-[80px_1fr_120px_50px]"
                    )}>
                      <span></span>
                      <span>Title</span>
                      <span>Date</span>
                      {!isViewer && <span className="text-right">Delete</span>}
                    </div>
                    {videos.map(v => (
                      <div
                        key={v.videoId}
                        className={cn(
                          "grid gap-2 px-4 py-2.5 border-b border-border/50 hover:bg-bg-elev/30 transition-colors items-center cursor-pointer",
                          isViewer ? "grid-cols-[80px_1fr_120px]" : "grid-cols-[80px_1fr_120px_50px]"
                        )}
                        onClick={() => setOpenVideoId(v.videoId)}
                      >
                        <div className="w-16 h-12 rounded-md overflow-hidden bg-bg-elev shrink-0">
                          <SafeThumbnail
                            src={v.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            iconSize={12}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-fg truncate">{v.title}</p>
                          <p className="text-[10px] text-fg-muted mt-0.5">
                            {v.subject}
                            {v.views !== undefined && ` · ${v.views} views`}
                            {v.likes !== undefined && ` · ${v.likes} likes`}
                            {v.duration && ` · ${v.duration}`}
                          </p>
                        </div>
                        <span className="text-[10px] text-fg-muted">{new Date(v.uploadedAt).toLocaleDateString()}</span>
                        {!isViewer && (
                          <div className="text-right">
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteVideo(v.videoId); }} className="text-rose-500 hover:text-rose-400 p-1 transition-colors cursor-pointer text-xs">
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass rounded-2xl p-10 text-center space-y-6">
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-sm font-semibold tracking-tight text-fg/90">March EduSkill Overview</h3>
                <p className="text-xs text-fg-muted">Select a faculty member from the leaderboard to view individual install statistics, customize their subjects, edit profile details, upload their photos, and manage their teaching videos.</p>
              </div>

              {/* General Cohort Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                  <p className="text-[9px] uppercase tracking-wider text-fg-muted mb-1">Clicks</p>
                  <p className="text-mono text-2xl font-bold text-blue-400">{totalClicks.toLocaleString()}</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <p className="text-[9px] uppercase tracking-wider text-fg-muted mb-1">Installs</p>
                  <p className="text-mono text-2xl font-bold text-emerald-400">{totalInstalls.toLocaleString()}</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <p className="text-[9px] uppercase tracking-wider text-fg-muted mb-1">Sessions</p>
                  <p className="text-mono text-2xl font-bold text-amber-400">{totalSessions.toLocaleString()}</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <p className="text-[9px] uppercase tracking-wider text-fg-muted mb-1">Conv. Rate</p>
                  <p className="text-mono text-2xl font-bold text-violet-400">
                    {totalClicks > 0 ? `${((totalInstalls / totalClicks) * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>

              {/* Combined Progress */}
              <div className="glass rounded-xl p-4 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-fg-muted uppercase tracking-wider">Combined Target Progress</span>
                  <span className="text-mono text-xs text-fg-muted">{totalInstalls} / {totalTarget} installs</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden bg-border">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, totalTarget > 0 ? (totalInstalls / totalTarget) * 100 : 0)}%` }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, var(--emerald), #34d399)" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <VideoDrawer videoId={openVideoId} onClose={() => setOpenVideoId(null)} managerMode={false} managerId={undefined} onRated={() => {}} hideScoring={true} />
    </div>
  );
}

function FacultyYTStats({ videos, facultyId }: { videos: (Video & { analysis?: GradiAnalysis | null })[]; facultyId?: string }) {
  const statsQ = useQuery({
    queryKey: ["faculty-yt-stats", facultyId],
    queryFn: async () => {
      if (!facultyId) return null;
      const res = await fetch(`/api/stats?facultyId=${facultyId}`);
      const d = await res.json();
      return { views: d.totalViews ?? 0, likes: d.totalLikes ?? 0, subscribers: d.subscribers ?? 0, syncedAt: d.ytStatsSyncedAt ?? null };
    },
    enabled: !!facultyId,
    staleTime: 60_000,
  });

  if (videos.length === 0) return null;

  const loading = statsQ.isLoading;
  const s = statsQ.data;

  function fmt(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-bg-elev/50 p-3 flex items-center gap-3">
          <Eye className="h-4 w-4 text-fg-muted" />
          <div>
            <p className="text-[9px] uppercase tracking-wider text-fg-muted">Total Views</p>
            <p className="text-mono text-lg font-bold text-fg">
              {loading ? "..." : s ? fmt(s.views) : "—"}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-elev/50 p-3 flex items-center gap-3">
          <ThumbsUp className="h-4 w-4 text-fg-muted" />
          <div>
            <p className="text-[9px] uppercase tracking-wider text-fg-muted">Total Likes</p>
            <p className="text-mono text-lg font-bold text-fg">
              {loading ? "..." : s ? fmt(s.likes) : "—"}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-elev/50 p-3 flex items-center gap-3">
          <Users className="h-4 w-4 text-fg-muted" />
          <div>
            <p className="text-[9px] uppercase tracking-wider text-fg-muted">Subscribers</p>
            <p className="text-mono text-lg font-bold text-fg">
              {loading ? "..." : s ? fmt(s.subscribers) : "—"}
            </p>
          </div>
        </div>
      </div>
      {s?.syncedAt && !isNaN(new Date(s.syncedAt).getTime()) && (
        <p className="text-[9px] text-fg-dim text-right">YT stats synced {new Date(s.syncedAt).toLocaleTimeString()}</p>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg">
          <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
        </div>
      }
    >
      <ManagerDashboardContent />
    </Suspense>
  );
}
