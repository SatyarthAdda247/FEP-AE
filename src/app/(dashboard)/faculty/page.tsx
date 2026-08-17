"use client";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, Sparkles, Loader2, Search, Plus, Clock } from "lucide-react";
import { HeroStats } from "@/components/HeroStats";
import { SubjectTabs } from "@/components/SubjectTabs";
import { VideoCard } from "@/components/VideoCard";
import { VideoDrawer } from "@/components/VideoDrawer";
import { VideoUploader } from "@/components/VideoUploader";
import { WelcomeGuide, type TourStep } from "@/components/WelcomeGuide";
import { INDIAN_STATES, type Subject, type Video, type GradiAnalysis, type JWTPayload } from "@/types";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Batch kickoff — shown in the post-onboarding welcome popup
const BATCH_STARTS_LABEL = "18 August 2026";

const TOUR_STEPS: TourStep[] = [
  { selector: '[data-tour="nav"]', title: "Find your way around", body: "Jump between your Dashboard, the Leaderboard, the Scoreboard, and the Archive from here anytime." },
  { selector: '[data-tour="upload"]', title: "Upload your teaching videos", body: "Paste a YouTube link here to submit a session. Aim for at least 3 videos over 5 minutes each week." },
  { selector: '[data-tour="stats"]', title: "Track your performance", body: "Your net score, views, likes, and manager ratings all update here as your videos get reviewed." },
  { selector: '[data-tour="edit-profile"]', title: "Keep your profile updated", body: "Change your photo, subjects, and personal details whenever you need to." },
  { selector: '[data-tour="videos"]', title: "Your uploads live here", body: "Open any video to see detailed AI and manager feedback on your teaching." },
];

interface FacultyStats {
  facultyId: string;
  facultyName?: string;
  facultyEmail?: string;
  phone?: string;
  backupPhone?: string;
  totalVideos: number;
  netScore: number;
  pctRatedByManager: number;
  age?: number;
  dob?: string;
  gender?: string;
  tshirtSize?: string;
  teachingSubject?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  subjects?: string[];
  avatarUrl?: string;
  // YouTube aggregate stats (synced hourly)
  totalViews?: number;
  totalLikes?: number;
  subscribers?: number;
  cohort?: string;
  ytStatsSyncedAt?: string | null;
  bySubject: Record<string, { count: number; videos: Video[] }>;
  videos: Video[];
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function isAbove5Mins(duration?: string): boolean {
  if (!duration) return false;
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (h * 3600 + m * 60 + s) > 300;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return (m * 60 + s) > 300;
  }
  return false;
}

function FacultyDashboardContent() {
  const [activeSubject, setActiveSubject] = useState<string>("all");
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const facultyId = searchParams ? searchParams.get("facultyId") : null;

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBackupPhone, setEditBackupPhone] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editTshirtSize, setEditTshirtSize] = useState("");
  const [editTeachingSubject, setEditTeachingSubject] = useState("");
  const [editAddressLine1, setEditAddressLine1] = useState("");
  const [editAddressLine2, setEditAddressLine2] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [editSubjects, setEditSubjects] = useState<string[]>([]);
  const [editAvatar, setEditAvatar] = useState("");

  const [subjectSearch, setSubjectSearch] = useState("");
  const [customSubjectInput, setCustomSubjectInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  const [showTrackerModal, setShowTrackerModal] = useState(false);
  const [hasCheckedTracker, setHasCheckedTracker] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<{ user: JWTPayload | null }> =>
      (await fetch("/api/auth/me")).json(),
  });

  const subjectsQ = useQuery({
    queryKey: ["subjects"],
    queryFn: async (): Promise<{ subjects: Subject[] }> =>
      (await fetch("/api/subjects")).json(),
  });

  const statsQ = useQuery({
    queryKey: ["faculty-stats", facultyId],
    queryFn: async (): Promise<FacultyStats> =>
      (await fetch(`/api/stats${facultyId ? `?facultyId=${facultyId}` : ""}`)).json(),
    refetchInterval: 6000,
  });

  const subjects = subjectsQ.data?.subjects ?? [];
  const stats = statsQ.data;
  const user = meQ.data?.user;

  const profileRequestsQ = useQuery<{ requests: any[] }>({
    queryKey: ["my-profile-requests", stats?.facultyId || user?.userId],
    queryFn: async () => {
      const targetId = stats?.facultyId || user?.userId;
      if (!targetId) return { requests: [] };
      return (await fetch(`/api/profile-requests?userId=${targetId}`)).json();
    },
    enabled: !!(stats?.facultyId || user?.userId),
    refetchInterval: 10_000,
  });

  const pendingRequest = (profileRequestsQ.data?.requests ?? []).find((r: any) => r.status === "pending");

  const isOwnProfile = user?.role === "eduskill_faculty" && (!facultyId || facultyId === user?.userId);

  useEffect(() => {
    if (user && user.role !== "eduskill_faculty" && !facultyId) {
      router.replace("/manager");
    }
  }, [user, facultyId, router]);

  // First visit right after onboarding → show the welcome popup + tour once,
  // and suppress the weekly-tracker modal for this load (new users have 0 videos).
  useEffect(() => {
    if (!isOwnProfile) return;
    try {
      if (localStorage.getItem("eduskill_welcome_pending")) {
        setShowWelcome(true);
        setHasCheckedTracker(true);
      }
    } catch {}
  }, [isOwnProfile]);

  useEffect(() => {
    if (stats && !hasCheckedTracker && isOwnProfile && !showWelcome) {
      const { monday, sunday } = getWeekRange();
      const weeklyVideos = (stats.videos ?? []).filter(v => {
        const d = new Date(v.uploadedAt);
        return d >= monday && d <= sunday;
      });
      const count = weeklyVideos.filter(v => isAbove5Mins(v.duration)).length;
      if (count < 3) {
        setShowTrackerModal(true);
      }
      setHasCheckedTracker(true);
    }
  }, [stats, isOwnProfile, hasCheckedTracker]);

  useEffect(() => {
    if (stats) {
      setEditName(stats.facultyName || "");
      setEditEmail(stats.facultyEmail || (user as any)?.email || "");
      setEditPhone(stats.phone || (user as any)?.phone || "");
      setEditBackupPhone(stats.backupPhone || "");
      setEditAge(stats.age ? String(stats.age) : "");
      setEditDob(stats.dob || "");
      setEditGender(stats.gender || "");
      setEditTshirtSize(stats.tshirtSize || "");
      setEditTeachingSubject(stats.teachingSubject || "");
      setEditAddressLine1(stats.addressLine1 || "");
      setEditAddressLine2(stats.addressLine2 || "");
      setEditCity(stats.city || "");
      setEditState(stats.state || "");
      setEditPincode(stats.pincode || "");
      setEditSubjects(stats.subjects || []);
      setEditAvatar(stats.avatarUrl || "");
    }
  }, [stats, user]);

  const filteredSubjectsOptions = useMemo(() => {
    if (!subjectSearch.trim()) return subjects;
    const query = subjectSearch.toLowerCase().trim();
    return subjects.filter(s => s.name.toLowerCase().includes(query) || s.subjectId.toLowerCase().includes(query));
  }, [subjects, subjectSearch]);

  function handleAddCustomSubject() {
    const trimmed = customSubjectInput.trim();
    if (!trimmed) return;
    if (editSubjects.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setCustomSubjectInput("");
      return;
    }
    setEditSubjects(prev => [...prev, trimmed]);
    setCustomSubjectInput("");
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: stats?.facultyId || user?.userId,
          name: editName,
          email: editEmail,
          phone: editPhone,
          backupPhone: editBackupPhone || undefined,
          age: editAge ? Number(editAge) : undefined,
          dob: editDob || undefined,
          gender: editGender || undefined,
          tshirtSize: editTshirtSize || undefined,
          teachingSubject: editTeachingSubject || undefined,
          addressLine1: editAddressLine1 || undefined,
          addressLine2: editAddressLine2 || undefined,
          city: editCity || undefined,
          state: editState || undefined,
          pincode: editPincode || undefined,
          subjects: editSubjects,
          avatarUrl: editAvatar || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.pendingApproval) {
          setStatusMessage({
            type: "info",
            text: "Profile update request submitted for admin approval! An admin will review your changes.",
          });
          profileRequestsQ.refetch();
        } else {
          setStatusMessage({ type: "success", text: "Profile details updated successfully!" });
          statsQ.refetch();
          setTimeout(() => setIsEditingProfile(false), 1200);
        }
      } else {
        setStatusMessage({ type: "error", text: `Failed to save details: ${data.error || "Unknown error"}` });
      }
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: "error", text: "Failed to send request. Please try again." });
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


  const filteredVideos = useMemo(() => {
    if (!stats?.videos) return [];
    if (activeSubject === "all") return stats.videos;
    return stats.videos.filter((v) => v.subjectId === activeSubject);
  }, [stats, activeSubject]);

  const subjectTabs = useMemo(() => {
    const tabs = [
      { id: "all", label: "All", count: stats?.totalVideos ?? 0 },
    ];
    for (const s of subjects) {
      const c = stats?.bySubject?.[s.subjectId]?.count;
      if (c)
        tabs.push({ id: s.subjectId, label: s.name, count: c });
    }
    return tabs;
  }, [subjects, stats]);


  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-center justify-between"
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted">
          <Sparkles className="h-3 w-3" />
          {isOwnProfile ? "Faculty Workspace" : "Faculty Profile View"}
        </div>
        {isOwnProfile && (
          <div className="flex items-center gap-3">
            <button
              data-tour="edit-profile"
              onClick={() => setIsEditingProfile(p => !p)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors cursor-pointer",
                isEditingProfile
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                  : "border-border bg-bg-elev/50 text-fg hover:border-border-strong"
              )}
            >
              ⚙️ {isEditingProfile ? "Done Editing" : "Edit Profile"}
            </button>
            <span data-tour="upload">
              <VideoUploader
                subjects={subjects}
                onSuccess={() => statsQ.refetch()}
              />
            </span>
          </div>
        )}
      </motion.div>

      {user && (
        <div data-tour="stats"><HeroStats
          name={stats?.facultyName || user.name}
          netScore={stats?.netScore ?? 0}
          totalVideos={stats?.totalVideos ?? 0}
          pctRated={stats?.pctRatedByManager ?? 0}
          trendDelta={0}
          totalViews={stats?.totalViews ?? 0}
          totalLikes={stats?.totalLikes ?? 0}
          subscribers={stats?.subscribers ?? 0}
          ytStatsSyncedAt={stats?.ytStatsSyncedAt}
          age={stats?.age}
          gender={(stats as any)?.gender}
          teachingSubject={(stats as any)?.teachingSubject}
          verticals={stats?.subjects}
          hideSubscribers={stats?.cohort === "March EduSkill"}
        /></div>
      )}

      <AnimatePresence>
        {isEditingProfile && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 overflow-hidden mt-6"
          >
            <div className="glass-strong rounded-2xl p-5 md:p-6 space-y-6 border border-border">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-sm font-semibold tracking-tight">Manage Profile Details</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="rounded-full border border-border bg-bg-elev/50 px-3 py-1.5 text-xs font-medium text-fg hover:border-border-strong cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="rounded-full bg-fg px-4 py-1.5 text-xs font-medium text-bg hover:bg-fg/90 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {savingProfile && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save Details
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-6 items-start">
                {/* Photo Upload */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative h-24 w-24 rounded-full border border-border overflow-hidden bg-bg-elev flex items-center justify-center">
                    {editAvatar ? (
                      <img src={editAvatar} alt="Profile preview" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl text-fg-dim">📷</span>
                    )}
                  </div>
                  <label className="cursor-pointer rounded-full border border-border bg-bg-elev px-3 py-1 text-[11px] font-medium text-fg hover:border-border-strong text-center">
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </div>

              {/* Pending Request / Status Notification Banners */}
              {pendingRequest && (
                <div className="flex items-center gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-xs text-sky-300">
                  <Clock className="h-4 w-4 shrink-0 text-sky-400" />
                  <div>
                    <span className="font-semibold">Pending Admin Approval:</span> You have a profile update request waiting for admin review. Submitting new changes will update your pending request.
                  </div>
                </div>
              )}

              {statusMessage && (
                <div className={cn(
                  "rounded-xl px-4 py-3 text-xs border font-medium flex items-center justify-between",
                  statusMessage.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                  statusMessage.type === "info" ? "border-sky-500/30 bg-sky-500/10 text-sky-300" :
                  "border-rose-500/30 bg-rose-500/10 text-rose-400"
                )}>
                  <span>{statusMessage.text}</span>
                  <button onClick={() => setStatusMessage(null)} className="text-xs hover:opacity-70">✕</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-6 items-start">
                {/* Photo Upload */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative h-24 w-24 rounded-full border border-border overflow-hidden bg-bg-elev flex items-center justify-center shadow-inner">
                    {editAvatar ? (
                      <img src={editAvatar} alt="Profile preview" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-2xl text-fg-dim">📷</span>
                    )}
                  </div>
                  <label className="cursor-pointer rounded-full border border-border bg-bg-elev px-3 py-1 text-[11px] font-medium text-fg hover:border-border-strong text-center transition-colors">
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </div>

                {/* Form Fields Grid */}
                <div className="space-y-5">
                  {/* Personal Information */}
                  <div>
                    <h3 className="text-xs font-semibold text-fg/80 uppercase tracking-wider mb-3">Personal Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Full Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="Name"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Email Address</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="email@example.com"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Primary Mobile</label>
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="10-digit mobile"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Backup Mobile</label>
                        <input
                          type="tel"
                          value={editBackupPhone}
                          onChange={(e) => setEditBackupPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="Backup mobile (optional)"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Age</label>
                        <input
                          type="number"
                          value={editAge}
                          onChange={(e) => setEditAge(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="Age"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Date of Birth (DOB)</label>
                        <input
                          type="date"
                          value={editDob}
                          onChange={(e) => setEditDob(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30 text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Gender</label>
                        <select
                          value={editGender}
                          onChange={(e) => setEditGender(e.target.value)}
                          className="w-full rounded-lg border border-border bg-[#181a20] px-3 py-2 text-sm outline-none focus:border-fg/30 text-white"
                        >
                          <option value="">Select Gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">T-Shirt Size</label>
                        <select
                          value={editTshirtSize}
                          onChange={(e) => setEditTshirtSize(e.target.value)}
                          className="w-full rounded-lg border border-border bg-[#181a20] px-3 py-2 text-sm outline-none focus:border-fg/30 text-white"
                        >
                          <option value="">Select T-Shirt Size</option>
                          {["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"].map((sz) => (
                            <option key={sz} value={sz}>{sz}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Teaching Details */}
                  <div>
                    <h3 className="text-xs font-semibold text-fg/80 uppercase tracking-wider mb-3">Teaching Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Subject (Teaching)</label>
                        <input
                          type="text"
                          value={editTeachingSubject}
                          onChange={(e) => setEditTeachingSubject(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="e.g. Maths, Physics, CS"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address Details */}
                  <div>
                    <h3 className="text-xs font-semibold text-fg/80 uppercase tracking-wider mb-3">Address Details</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Address Line 1</label>
                        <input
                          type="text"
                          value={editAddressLine1}
                          onChange={(e) => setEditAddressLine1(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="House/Flat No., Building Name, Street"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Address Line 2 (Optional)</label>
                        <input
                          type="text"
                          value={editAddressLine2}
                          onChange={(e) => setEditAddressLine2(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="Landmark, Area, Locality"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">City</label>
                        <input
                          type="text"
                          value={editCity}
                          onChange={(e) => setEditCity(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="City"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">State</label>
                        <select
                          value={editState}
                          onChange={(e) => setEditState(e.target.value)}
                          className="w-full rounded-lg border border-border bg-[#181a20] px-3 py-2 text-sm outline-none focus:border-fg/30 text-white"
                        >
                          <option value="">Select State</option>
                          {INDIAN_STATES.map((st) => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Pincode</label>
                        <input
                          type="text"
                          value={editPincode}
                          onChange={(e) => setEditPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="w-full rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-sm outline-none focus:border-fg/30"
                          placeholder="6-digit pincode"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Custom Subjects Selection */}
                  <div className="pt-3 border-t border-border/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider block">Custom Subjects Selection</label>
                        <p className="text-[11px] text-fg-dim">Search given options or enter custom subjects below.</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Search bar */}
                        <div className="relative min-w-[180px]">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
                          <input
                            type="text"
                            value={subjectSearch}
                            onChange={(e) => setSubjectSearch(e.target.value)}
                            placeholder="Search subjects..."
                            className="w-full rounded-lg border border-border bg-bg-elev/60 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-fg/30"
                          />
                          {subjectSearch && (
                            <button onClick={() => setSubjectSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg text-xs font-bold cursor-pointer">×</button>
                          )}
                        </div>

                        {/* Add custom subject */}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={customSubjectInput}
                            onChange={(e) => setCustomSubjectInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddCustomSubject();
                              }
                            }}
                            placeholder="Enter custom subject..."
                            className="w-[170px] rounded-lg border border-border bg-bg-elev/60 px-2.5 py-1.5 text-xs outline-none focus:border-fg/30"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomSubject}
                            disabled={!customSubjectInput.trim()}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Selected Subjects Badges */}
                    {editSubjects.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 self-center mr-1">Selected ({editSubjects.length}):</span>
                        {editSubjects.map((subIdOrName) => {
                          const matchingObj = subjects.find(s => s.subjectId === subIdOrName || s.name === subIdOrName);
                          const displayName = matchingObj ? matchingObj.name : subIdOrName;
                          return (
                            <span key={subIdOrName} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                              {displayName}
                              <button
                                type="button"
                                onClick={() => setEditSubjects(editSubjects.filter(x => x !== subIdOrName))}
                                className="hover:text-rose-400 transition-colors text-xs font-bold ml-0.5 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Subject Options Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 rounded-xl border border-border bg-bg-elev/20 p-3 max-h-[180px] overflow-y-auto no-scrollbar">
                      {filteredSubjectsOptions.length > 0 ? (
                        filteredSubjectsOptions.map((s) => {
                          const isChecked = editSubjects.includes(s.subjectId) || editSubjects.includes(s.name);
                          return (
                            <label key={s.subjectId} className="flex items-center gap-2 text-xs text-fg-muted hover:text-fg cursor-pointer p-1 rounded hover:bg-bg-elev/40">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setEditSubjects(editSubjects.filter((x) => x !== s.subjectId && x !== s.name));
                                  } else {
                                    setEditSubjects([...editSubjects, s.subjectId]);
                                  }
                                }}
                                className="rounded border-border text-fg bg-bg-elev"
                              />
                              <span className="truncate">{s.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <div className="col-span-full py-4 text-center text-xs text-fg-dim">
                          No predefined subjects match "{subjectSearch}". Use the "Enter custom subject" field above to add custom subjects.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      <div className="mt-8" data-tour="videos">
        <div className="mb-5 flex items-center justify-between border-b border-border pb-2">
          <SubjectTabs
            subjects={subjectTabs}
            active={activeSubject}
            onChange={setActiveSubject}
          />
        </div>

        {statsQ.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-xl shimmer border border-border"
              />
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVideos.map((v, i) => (
              <VideoCard
                key={v.videoId}
                video={v}
                index={i}
                onClick={() => setOpenVideoId(v.videoId)}
              />
            ))}
          </div>
        )}
      </div>

      <VideoDrawer
        videoId={openVideoId}
        onClose={() => setOpenVideoId(null)}
      />

      {/* Weekly Upload Tracker Modal */}
      <AnimatePresence>
        {showTrackerModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrackerModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            {/* Content */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elev/90 p-6 shadow-2xl backdrop-blur-xl space-y-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 text-xl">
                  ⚠️
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-fg leading-none">Weekly Upload Tracker</h3>
                  <p className="text-[11px] text-fg-dim mt-1.5 uppercase tracking-wider font-semibold">Monday to Sunday Requirement</p>
                </div>
              </div>

              <div className="space-y-3 mt-4">
                <p className="text-sm text-fg/90 leading-relaxed">
                  Every faculty member is required to upload at least <strong>3 videos above 5 minutes</strong> in length each week (Monday to Sunday).
                </p>
                
                {/* Progress Visualizer */}
                {(() => {
                  const { monday, sunday } = getWeekRange();
                  const weeklyVideos = (stats?.videos ?? []).filter(v => {
                    const d = new Date(v.uploadedAt);
                    return d >= monday && d <= sunday;
                  });
                  const targetVideos = weeklyVideos.filter(v => isAbove5Mins(v.duration));
                  const count = targetVideos.length;
                  const pct = Math.min(100, (count / 3) * 100);

                  return (
                    <div className="rounded-xl border border-border bg-bg/50 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted font-medium">Your progress this week:</span>
                        <span className="font-mono font-bold text-fg">{count} / 3 videos</span>
                      </div>
                      
                      <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ width: `${pct}%`, backgroundColor: count >= 3 ? "var(--emerald)" : "var(--amber)", backgroundImage: count >= 3 ? "none" : "linear-gradient(90deg, #f59e0b, #fbbf24)" }}
                        />
                      </div>

                      {count < 3 ? (
                        <p className="text-[11px] text-amber-500 font-medium">
                          Action required: Please upload {3 - count} more video{3 - count > 1 ? "s" : ""} above 5 mins.
                        </p>
                      ) : (
                        <p className="text-[11px] text-emerald-500 font-medium">
                          Goal met! Thank you for completing your weekly uploads.
                        </p>
                      )}

                      {weeklyVideos.length > 0 && (
                        <div className="pt-2 border-t border-border/60 space-y-1.5 max-h-[120px] overflow-y-auto pr-1 no-scrollbar">
                          <p className="text-[9px] uppercase tracking-wider text-fg-dim font-bold">This week's uploads</p>
                          {weeklyVideos.map(v => {
                            const valid = isAbove5Mins(v.duration);
                            return (
                              <div key={v.videoId} className="flex items-center justify-between text-[11px] gap-2">
                                <span className="truncate text-fg/80">{v.title}</span>
                                <span className={`shrink-0 font-mono font-medium ${valid ? "text-emerald-500" : "text-fg-dim"}`}>
                                  {v.duration || "—"} {valid ? "✓" : "✗"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowTrackerModal(false)}
                  className="rounded-xl bg-fg px-5 py-2.5 text-xs font-semibold text-bg hover:opacity-90 transition-opacity cursor-pointer border-none"
                >
                  I Understand
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* First-run welcome popup + navigation tour (post-onboarding) */}
      {showWelcome && (
        <WelcomeGuide
          steps={TOUR_STEPS}
          batchStartsLabel={BATCH_STARTS_LABEL}
          onFinish={() => {
            setShowWelcome(false);
            try { localStorage.removeItem("eduskill_welcome_pending"); } catch {}
          }}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-elev/30 py-16 text-center"
    >
      <Inbox className="h-8 w-8 text-fg-dim mb-3" />
      <h3 className="text-base font-medium text-fg">No videos yet</h3>
      <p className="text-sm text-fg-muted mt-1 max-w-xs">
        Upload your first YouTube video to start tracking your performance.
      </p>
    </motion.div>
  );
}

export default function FacultyDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg">
          <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
        </div>
      }
    >
      <FacultyDashboardContent />
    </Suspense>
  );
}
