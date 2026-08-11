"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Search, Shield, Users, UserCheck, Loader2, Check, X, Edit2, Link2, Copy, Lock, Unlock, RefreshCw, UsersRound, Download, ClipboardCheck } from "lucide-react";
import type { User, Role, Cohort } from "@/types";
import { cn } from "@/lib/utils";

type CohortRow = Cohort & { memberCount: number; pendingCount: number };
type CohortsResponse = { cohorts: CohortRow[]; legacy: { name: string; memberCount: number }[] };

const ROLE_LABELS: Record<Role, { label: string; color: string }> = {
  eduskill_admin:   { label: "Admin",   color: "text-violet-500 bg-violet-500/10 border-violet-500/25" },
  eduskill_manager: { label: "Manager", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/25" },
  eduskill_faculty: { label: "Faculty", color: "text-sky-500 bg-sky-500/10 border-sky-500/25" },
  // JWT-only role for @adda247.com Google sign-ins; never stored on user records
  eduskill_viewer:  { label: "Viewer",  color: "text-fg-muted bg-bg-elev border-border" },
};

export default function AdminDashboard() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", role: "eduskill_faculty" as Role, subjects: "", teachingSubject: "", examTarget: "", cohort: "June EduSkill" });

  const usersQ = useQuery<{ users: User[] }>({
    queryKey: ["admin-users"],
    queryFn: () => fetch("/api/admin/users").then(r => r.json()),
  });

  const cohortsQ = useQuery<CohortsResponse>({
    queryKey: ["admin-cohorts"],
    queryFn: () => fetch("/api/admin/cohorts").then(r => r.json()),
  });
  const cohortNames = [
    ...(cohortsQ.data?.cohorts ?? []).map(c => c.name),
    ...(cohortsQ.data?.legacy ?? []).map(c => c.name),
  ];

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setAdding(false); setDraft({ name: "", email: "", phone: "", role: "eduskill_faculty", subjects: "", teachingSubject: "", examTarget: "", cohort: "June EduSkill" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) =>
      fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", email: "", role: "eduskill_faculty" as Role, teachingSubject: "", cohort: "", subjects: "" });

  const updateMut = useMutation({
    mutationFn: (data: { userId: string; name: string; email: string; role: Role; subjects: string[]; teachingSubject?: string; cohort?: string }) =>
      fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditingUserId(null);
    }
  });

  function startEdit(u: User) {
    setEditingUserId(u.userId);
    setEditDraft({
      name: u.name || "",
      email: u.email || "",
      role: u.role || "eduskill_faculty",
      teachingSubject: u.teachingSubject || "",
      cohort: u.cohort || "",
      subjects: u.subjects ? u.subjects.join(", ") : "",
    });
  }

  function saveEdit(userId: string) {
    updateMut.mutate({
      userId,
      name: editDraft.name,
      email: editDraft.email,
      role: editDraft.role,
      teachingSubject: editDraft.teachingSubject || undefined,
      cohort: editDraft.cohort || undefined,
      subjects: editDraft.subjects ? editDraft.subjects.split(",").map(s => s.trim()).filter(Boolean) : [],
    });
  }

  const users = usersQ.data?.users ?? [];
  const filtered = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    faculty: users.filter(u => u.role === "eduskill_faculty").length,
    managers: users.filter(u => u.role === "eduskill_manager").length,
    admins: users.filter(u => u.role === "eduskill_admin").length,
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 md:py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted w-fit mb-4">
          <Shield className="h-3 w-3" />Admin Console
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">User Management</h1>
        <p className="text-sm text-fg-muted mb-6">Add, remove, and manage all EduSkill user accounts.</p>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="Total Users" value={stats.total} />
        <StatCard icon={UserCheck} label="Faculty" value={stats.faculty} />
        <StatCard icon={Shield} label="Managers" value={stats.managers} />
        <StatCard icon={Shield} label="Admins" value={stats.admins} />
      </div>

      {/* Pending approvals */}
      <ApprovalsPanel />

      {/* Cohorts */}
      <CohortsPanel data={cohortsQ.data} isLoading={cohortsQ.isLoading} />

      {/* Onboarding submissions archive */}
      <OnboardingPanel cohortNames={cohortNames} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-full border border-border bg-bg-elev/60 pl-9 pr-3 py-2 text-sm outline-none focus:border-fg/30" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none">
          <option value="all">All Roles</option>
          <option value="eduskill_faculty">Faculty</option>
          <option value="eduskill_manager">Manager</option>
          <option value="eduskill_admin">Admin</option>
        </select>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg hover:bg-fg/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />Add User
        </button>
      </div>

      {/* Add user form */}
      {adding && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-5 mb-5">
          <h3 className="text-sm font-semibold mb-4">New User</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Full Name *" className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none" />
            <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
              placeholder="Email *" className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none" />
            <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
              placeholder="Phone" className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none" />
            <select value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value as Role }))}
              className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none">
              <option value="eduskill_faculty">Faculty</option>
              <option value="eduskill_manager">Manager</option>
              <option value="eduskill_admin">Admin</option>
            </select>
            <input value={draft.subjects} onChange={e => setDraft(d => ({ ...d, subjects: e.target.value }))}
              placeholder="Vertical (e.g. ssc, neet)" className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none" />
            <input value={draft.teachingSubject} onChange={e => setDraft(d => ({ ...d, teachingSubject: e.target.value }))}
              placeholder="Teaching Subject" className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none" />
            <input value={draft.cohort} onChange={e => setDraft(d => ({ ...d, cohort: e.target.value }))}
              list="cohort-names" placeholder="Cohort (e.g. June EduSkill)" className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none" />
            <datalist id="cohort-names">
              {cohortNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => createMut.mutate({
                ...draft,
                subjects: draft.subjects ? draft.subjects.split(",").map(s => s.trim()) : [],
              })}
              disabled={!draft.name || !draft.email || createMut.isPending}
              className="flex items-center gap-1.5 rounded-full bg-fg px-4 py-1.5 text-xs font-medium text-bg disabled:opacity-40">
              {createMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Create
            </button>
            <button onClick={() => setAdding(false)}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs text-fg-muted hover:text-fg">
              <X className="h-3.5 w-3.5" />Cancel
            </button>
          </div>
          {createMut.data?.error && (
            <p className="mt-2 text-xs text-rose-500">{createMut.data.error}</p>
          )}
        </motion.div>
      )}

      {/* Users table */}
      <div className="glass rounded-2xl overflow-hidden">
        {usersQ.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-fg-muted border-b border-border">
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-3 py-3 font-medium">Email</th>
                  <th className="text-left px-3 py-3 font-medium">Role</th>
                  <th className="text-left px-3 py-3 font-medium">Cohort</th>
                  <th className="text-left px-3 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const r = ROLE_LABELS[u.role] ?? ROLE_LABELS.eduskill_faculty;
                  const isEditing = editingUserId === u.userId;
                  return (
                    <tr key={u.userId} className="group border-b border-border/60 last:border-0 hover:bg-bg-elev/40 transition-colors">
                      <td className="px-5 py-2.5 font-medium text-fg/90 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.name}
                            onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                            className="rounded border border-border bg-bg px-2 py-1 text-xs w-full max-w-[150px] outline-none focus:border-fg/30"
                          />
                        ) : (
                          u.name
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted text-xs">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.email}
                            onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))}
                            className="rounded border border-border bg-bg px-2 py-1 text-xs w-full max-w-[200px] outline-none focus:border-fg/30"
                          />
                        ) : (
                          <>
                            {u.email}
                            {(u.videoSampleLink || u.resumeLink || u.dob) && (
                              <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                                {u.dob && <span className="text-fg-dim">DOB: {u.dob}</span>}
                                {u.videoSampleLink && (
                                  <a href={u.videoSampleLink} target="_blank" rel="noopener noreferrer"
                                    className="text-sky-500 hover:underline">Video Sample</a>
                                )}
                                {u.resumeLink && (
                                  <a href={u.resumeLink} target="_blank" rel="noopener noreferrer"
                                    className="text-sky-500 hover:underline">Resume</a>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <select
                            value={editDraft.role}
                            onChange={e => setEditDraft(d => ({ ...d, role: e.target.value as Role }))}
                            className="rounded border border-border bg-bg px-2 py-1 text-xs outline-none focus:border-fg/30"
                          >
                            <option value="eduskill_faculty">Faculty</option>
                            <option value="eduskill_manager">Manager</option>
                            <option value="eduskill_admin">Admin</option>
                          </select>
                        ) : (
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium", r.color)}>
                            {r.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted text-xs">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft.cohort}
                            onChange={e => setEditDraft(d => ({ ...d, cohort: e.target.value }))}
                            className="rounded border border-border bg-bg px-2 py-1 text-xs w-full max-w-[120px] outline-none focus:border-fg/30"
                          />
                        ) : (
                          u.cohort ?? "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-fg-muted text-xs">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={editDraft.teachingSubject}
                              onChange={e => setEditDraft(d => ({ ...d, teachingSubject: e.target.value }))}
                              placeholder="Teaching Subject"
                              className="rounded border border-border bg-bg px-2 py-1 text-[11px] w-full max-w-[150px] outline-none focus:border-fg/30"
                            />
                            <input
                              type="text"
                              value={editDraft.subjects}
                              onChange={e => setEditDraft(d => ({ ...d, subjects: e.target.value }))}
                              placeholder="Verticals (e.g. ssc, neet)"
                              className="rounded border border-border bg-bg px-2 py-1 text-[10px] w-full max-w-[150px] outline-none focus:border-fg/30"
                            />
                          </div>
                        ) : (
                          <>
                            <div>{u.teachingSubject || "—"}</div>
                            {u.subjects && u.subjects.length > 0 && (
                              <div className="text-[10px] text-fg-dim mt-0.5">
                                Verticals: {u.subjects.join(", ")}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => saveEdit(u.userId)}
                              disabled={updateMut.isPending}
                              className="text-emerald-500 hover:bg-emerald-500/10 p-1.5 rounded-lg cursor-pointer inline-flex items-center justify-center border-none bg-transparent"
                              title="Save Changes"
                            >
                              {updateMut.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="text-fg-dim hover:text-rose-500 p-1.5 rounded-lg cursor-pointer inline-flex items-center justify-center border-none bg-transparent"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => startEdit(u)}
                              className="text-fg-dim hover:text-emerald-500 p-1.5 hover:bg-emerald-500/10 rounded-lg cursor-pointer inline-flex items-center justify-center border-none bg-transparent"
                              title="Edit User"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Delete ${u.name}?`)) deleteMut.mutate(u.userId); }}
                              className="text-fg-dim hover:text-rose-500 p-1.5 hover:bg-rose-500/10 rounded-lg cursor-pointer inline-flex items-center justify-center border-none bg-transparent"
                              title="Delete User"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-3 border-t border-border text-[11px] text-fg-muted">
          Showing {filtered.length} of {users.length} users
        </div>
      </div>
    </div>
  );
}

function ApprovalsPanel() {
  const qc = useQueryClient();
  const pendingQ = useQuery<{ pending: User[] }>({
    queryKey: ["admin-approvals"],
    queryFn: () => fetch("/api/admin/approvals").then(r => r.json()),
  });

  const actMut = useMutation({
    mutationFn: (body: { userId: string; action: "approve" | "reject" }) =>
      fetch("/api/admin/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-approvals"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-cohorts"] });
    },
  });

  const pending = pendingQ.data?.pending ?? [];
  if (pendingQ.isLoading || pending.length === 0) return null;

  return (
    <div className="glass-strong rounded-2xl p-5 mb-6 border border-amber-500/20">
      <div className="flex items-center gap-2 mb-1">
        <UserCheck className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Pending Approvals</h2>
        <span className="rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-500 px-2 py-0.5 text-[10px] font-medium">
          {pending.length}
        </span>
      </div>
      <p className="text-xs text-fg-muted mb-4">
        These people applied via a cohort invite link. They can&apos;t log in until approved.
      </p>

      <div className="space-y-2">
        {pending.map(u => (
          <div key={u.userId} className="flex items-center gap-3 flex-wrap rounded-xl border border-border/60 bg-bg-elev/40 px-4 py-3">
            <div className="min-w-[180px]">
              <div className="text-sm font-medium">{u.name}</div>
              <div className="text-[11px] text-fg-muted">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
            </div>
            <div className="text-[11px] text-fg-muted">
              <div>{u.cohort ?? "—"}{u.teachingSubject ? ` · ${u.teachingSubject}` : ""}</div>
              <div className="flex items-center gap-2 mt-0.5">
                {u.dob && <span className="text-fg-dim">DOB: {u.dob}</span>}
                {u.videoSampleLink && (
                  <a href={u.videoSampleLink} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">Video Sample</a>
                )}
                {u.resumeLink && (
                  <a href={u.resumeLink} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">Resume</a>
                )}
              </div>
            </div>
            <div className="ml-auto inline-flex items-center gap-2">
              <button onClick={() => actMut.mutate({ userId: u.userId, action: "approve" })} disabled={actMut.isPending}
                className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500/20 disabled:opacity-40">
                <Check className="h-3.5 w-3.5" />Approve
              </button>
              <button onClick={() => { if (confirm(`Reject ${u.name}'s application?`)) actMut.mutate({ userId: u.userId, action: "reject" }); }} disabled={actMut.isPending}
                className="flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-500 px-3 py-1.5 text-xs font-medium hover:bg-rose-500/20 disabled:opacity-40">
                <X className="h-3.5 w-3.5" />Reject
              </button>
            </div>
          </div>
        ))}
      </div>
      {actMut.data?.error && <p className="mt-3 text-xs text-rose-500">{actMut.data.error}</p>}
    </div>
  );
}

function CohortsPanel({ data, isLoading }: { data?: CohortsResponse; isLoading: boolean }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-cohorts"] });

  const createMut = useMutation({
    mutationFn: (body: { name: string; capacity?: string }) =>
      fetch("/api/admin/cohorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: (res) => { if (!res.error) { setNewName(""); setNewCapacity(""); } invalidate(); },
  });

  const updateMut = useMutation({
    mutationFn: (body: { cohortId: string; signupOpen?: boolean; regenerateCode?: boolean; capacity?: number | null }) =>
      fetch("/api/admin/cohorts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (cohortId: string) =>
      fetch("/api/admin/cohorts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cohortId }) }).then(r => r.json()),
    onSuccess: invalidate,
  });

  function copyLink(c: CohortRow) {
    navigator.clipboard.writeText(`${window.location.origin}/join/${c.inviteCode}`);
    setCopiedId(c.cohortId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const cohorts = data?.cohorts ?? [];
  const legacy = data?.legacy ?? [];

  return (
    <div className="glass rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <UsersRound className="h-4 w-4 text-fg-muted" />
        <h2 className="text-sm font-semibold">Cohorts</h2>
      </div>
      <p className="text-xs text-fg-muted mb-4">
        Create a cohort, then share its invite link — new faculty sign themselves up and land directly in it.
      </p>

      {/* One-click create */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMut.mutate({ name: newName, capacity: newCapacity }); }}
          placeholder="New cohort name (e.g. August EduSkill)"
          className="flex-1 max-w-sm rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
        <input value={newCapacity} onChange={e => setNewCapacity(e.target.value.replace(/\D/g, ""))}
          placeholder="Seats (optional)" inputMode="numeric"
          className="w-32 rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
        <button onClick={() => createMut.mutate({ name: newName, capacity: newCapacity })} disabled={!newName.trim() || createMut.isPending}
          className="flex items-center gap-1.5 rounded-full bg-fg px-4 py-2 text-xs font-medium text-bg disabled:opacity-40">
          {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create Cohort
        </button>
      </div>
      {createMut.data?.error && <p className="mb-3 text-xs text-rose-500">{createMut.data.error}</p>}

      {isLoading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
        </div>
      ) : (
        <div className="space-y-2">
          {cohorts.length === 0 && legacy.length === 0 && (
            <p className="text-xs text-fg-dim">No cohorts yet — create your first one above.</p>
          )}
          {cohorts.map(c => (
            <div key={c.cohortId} className="flex items-center gap-3 flex-wrap rounded-xl border border-border/60 bg-bg-elev/40 px-4 py-2.5">
              <div className="min-w-[140px]">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-[10px] text-fg-dim">
                  {c.capacity ? `${c.memberCount} / ${c.capacity} seats` : `${c.memberCount} member${c.memberCount === 1 ? "" : "s"}`}
                  {c.pendingCount > 0 && <span className="text-amber-500"> · {c.pendingCount} pending</span>}
                </div>
              </div>
              <span className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium",
                c.signupOpen
                  ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/25"
                  : "text-fg-dim bg-bg-elev border-border"
              )}>
                {c.signupOpen ? "Signup Open" : "Signup Closed"}
              </span>
              <code className="flex items-center gap-1 text-[11px] text-fg-muted bg-bg px-2 py-1 rounded-md border border-border/60">
                <Link2 className="h-3 w-3" />/join/{c.inviteCode}
              </code>
              <div className="ml-auto inline-flex items-center gap-1">
                <button onClick={() => copyLink(c)} title="Copy invite link"
                  className="text-fg-dim hover:text-sky-500 p-1.5 hover:bg-sky-500/10 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent">
                  {copiedId === c.cohortId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => updateMut.mutate({ cohortId: c.cohortId, signupOpen: !c.signupOpen })}
                  title={c.signupOpen ? "Close signups" : "Reopen signups"}
                  className="text-fg-dim hover:text-amber-500 p-1.5 hover:bg-amber-500/10 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent">
                  {c.signupOpen ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => {
                  const v = prompt(`Seat limit for "${c.name}" (blank or 0 = unlimited):`, c.capacity ? String(c.capacity) : "");
                  if (v === null) return;
                  const n = Number(v.trim() || 0);
                  if (!Number.isInteger(n) || n < 0) { alert("Enter a whole number."); return; }
                  updateMut.mutate({ cohortId: c.cohortId, capacity: n === 0 ? null : n });
                }} title="Set seat limit"
                  className="text-fg-dim hover:text-emerald-500 p-1.5 hover:bg-emerald-500/10 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent">
                  <Users className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { if (confirm("Generate a new invite link? The old link will stop working.")) updateMut.mutate({ cohortId: c.cohortId, regenerateCode: true }); }}
                  title="Regenerate invite link"
                  className="text-fg-dim hover:text-violet-500 p-1.5 hover:bg-violet-500/10 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { if (confirm(`Delete cohort "${c.name}"? Existing members keep their cohort label, but the invite link stops working.`)) deleteMut.mutate(c.cohortId); }}
                  title="Delete cohort"
                  className="text-fg-dim hover:text-rose-500 p-1.5 hover:bg-rose-500/10 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {legacy.map(l => (
            <div key={l.name} className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-2.5 opacity-70">
              <div className="min-w-[140px]">
                <div className="text-sm font-medium">{l.name}</div>
                <div className="text-[10px] text-fg-dim">{l.memberCount} member{l.memberCount === 1 ? "" : "s"} · legacy (no invite link)</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface OnboardingSubmission {
  userId: string; name: string; email: string; phone: string; cohort: string;
  address: string; age: number | ""; gender: string; tshirtSize: string;
  profileComplete: boolean; onboardedAt: string;
}

const CSV_COLUMNS: { key: keyof OnboardingSubmission; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "cohort", label: "Cohort" },
  { key: "address", label: "Address" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "tshirtSize", label: "T-Shirt Size" },
  { key: "profileComplete", label: "Profile Complete" },
  { key: "onboardedAt", label: "Onboarded At" },
];

function toCsv(rows: OnboardingSubmission[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = CSV_COLUMNS.map(c => esc(c.label)).join(",");
  const lines = rows.map(r => CSV_COLUMNS.map(c => esc(r[c.key])).join(","));
  return [header, ...lines].join("\n");
}

function OnboardingPanel({ cohortNames }: { cohortNames: string[] }) {
  const [cohortFilter, setCohortFilter] = useState("all");
  const [search, setSearch] = useState("");

  const q = useQuery<{ submissions: OnboardingSubmission[] }>({
    queryKey: ["admin-onboarding", cohortFilter],
    queryFn: () => fetch(`/api/admin/onboarding${cohortFilter !== "all" ? `?cohort=${encodeURIComponent(cohortFilter)}` : ""}`).then(r => r.json()),
  });

  const rows = (q.data?.submissions ?? []).filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase())
  );

  function exportCsv() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `onboarding-submissions${cohortFilter !== "all" ? `-${cohortFilter.replace(/\s+/g, "-")}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="glass rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardCheck className="h-4 w-4 text-fg-muted" />
        <h2 className="text-sm font-semibold">Onboarding Submissions</h2>
      </div>
      <p className="text-xs text-fg-muted mb-4">
        Profile details faculty confirm on first login (name, email, mobile, address, age, gender, t-shirt size). Exportable as a sheet.
      </p>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email..."
            className="w-full rounded-full border border-border bg-bg-elev/60 pl-9 pr-3 py-2 text-sm outline-none focus:border-fg/30" />
        </div>
        <select value={cohortFilter} onChange={e => setCohortFilter(e.target.value)}
          className="rounded-full border border-border bg-bg-elev/60 px-3 py-2 text-xs outline-none">
          <option value="all">All cohorts</option>
          {cohortNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={exportCsv} disabled={!rows.length}
          className="flex items-center gap-1.5 rounded-full bg-fg px-4 py-2 text-xs font-medium text-bg disabled:opacity-40">
          <Download className="h-3.5 w-3.5" />Export CSV
        </button>
      </div>

      {q.isLoading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-fg-muted border-b border-border bg-bg-elev/40">
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-3 py-2.5 font-medium">Email</th>
                <th className="text-left px-3 py-2.5 font-medium">Phone</th>
                <th className="text-left px-3 py-2.5 font-medium">Cohort</th>
                <th className="text-left px-3 py-2.5 font-medium">Address</th>
                <th className="text-left px-3 py-2.5 font-medium">Age</th>
                <th className="text-left px-3 py-2.5 font-medium">Gender</th>
                <th className="text-left px-3 py-2.5 font-medium">Size</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.userId} className="border-b border-border/60 last:border-0 hover:bg-bg-elev/40">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs whitespace-nowrap">{r.email}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs whitespace-nowrap">{r.phone || "—"}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs whitespace-nowrap">{r.cohort || "—"}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs max-w-[180px] truncate">{r.address || "—"}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs">{r.age || "—"}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs whitespace-nowrap">{r.gender || "—"}</td>
                  <td className="px-3 py-2 text-fg-muted text-xs">{r.tshirtSize || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      r.profileComplete
                        ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/25"
                        : "text-amber-500 bg-amber-500/10 border-amber-500/25"
                    )}>
                      {r.profileComplete ? "Complete" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-fg-muted">No submissions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-fg-muted">
        <Icon className="h-3 w-3" />{label}
      </div>
      <div className="mt-1.5 text-mono text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
