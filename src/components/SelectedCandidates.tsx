"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, Trash2, FileText, Play, UserCheck, Users, Edit2, Check, X } from "lucide-react";
import type { SelectedCandidate } from "@/types";
import { cn } from "@/lib/utils";

const FLAG_OPTIONS = ["Yes", "No", "May be"] as const;
const FLAG_STYLES: Record<string, string> = {
  Yes: "text-emerald-500 bg-emerald-500/10 border-emerald-500/25",
  No: "text-rose-500 bg-rose-500/10 border-rose-500/25",
};
const FLAG_DEFAULT = "text-fg-muted bg-bg-elev border-border";

function Flag({ value }: { value?: string }) {
  if (!value) return <span className="text-fg-dim">—</span>;
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", FLAG_STYLES[value] ?? FLAG_DEFAULT)}>
      {value}
    </span>
  );
}

const cellInput = "rounded border border-border bg-bg px-2 py-1 text-xs w-full outline-none focus:border-fg/30";

type EditDraft = {
  name: string; regNo: string; contact: string; subject: string; vertical: string;
  replacement: string; newInitiatives: string; offlineEducators: string;
  resumeLink: string; videoLink: string;
};

function FlagSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={cn(cellInput, "min-w-[80px]")}>
      <option value="">—</option>
      {FLAG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function SelectedCandidatesPanel({ cohort }: { cohort: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const q = useQuery<{ candidates: SelectedCandidate[] }>({
    queryKey: ["selected-candidates", cohort],
    queryFn: () => fetch(`/api/selected-candidates?cohort=${encodeURIComponent(cohort)}`).then(r => r.json()),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["selected-candidates"] });

  const removeMut = useMutation({
    mutationFn: (candidateId: string) =>
      fetch("/api/selected-candidates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId }) }).then(r => r.json()),
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: (body: { candidateId: string } & EditDraft) =>
      fetch("/api/selected-candidates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: (res) => {
      if (!res.error) { setEditingId(null); setDraft(null); }
      invalidate();
    },
  });

  function startEdit(c: SelectedCandidate) {
    setEditingId(c.candidateId);
    setDraft({
      name: c.name ?? "", regNo: c.regNo ?? "", contact: c.contact ?? "",
      subject: c.subject ?? "", vertical: c.vertical ?? "",
      replacement: c.replacement ?? "", newInitiatives: c.newInitiatives ?? "",
      offlineEducators: c.offlineEducators ?? "",
      resumeLink: c.resumeLink ?? "", videoLink: c.videoLink ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  const candidates = (q.data?.candidates ?? []).filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.regNo ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.subject ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.vertical ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3 flex-wrap mb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-500" />
            <h2 className="text-base font-semibold tracking-tight">Selected Candidates</h2>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 px-2 py-0.5 text-[10px] font-medium">
              {q.data?.candidates?.length ?? 0}
            </span>
          </div>
          <p className="text-xs text-fg-muted mt-0.5 flex items-center gap-1">
            <Users className="h-3 w-3" />{cohort}
          </p>
        </div>
        <div className="relative ml-auto min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, reg no, subject..."
            className="w-full rounded-full border border-border bg-bg-elev/60 pl-9 pr-3 py-2 text-sm outline-none focus:border-fg/30" />
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
        {q.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-fg-muted">
            No selected candidates for {cohort} yet. Pick faculty from the Roster to add them here.
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg z-10">
                <tr className="text-[10px] uppercase tracking-wider text-fg-muted border-b border-border">
                  <th className="text-left px-5 py-3 font-medium">Reg No.</th>
                  <th className="text-left px-3 py-3 font-medium">Name</th>
                  <th className="text-left px-3 py-3 font-medium">Contact</th>
                  <th className="text-left px-3 py-3 font-medium">Subject</th>
                  <th className="text-left px-3 py-3 font-medium">Vertical</th>
                  <th className="text-left px-3 py-3 font-medium">Replacement</th>
                  <th className="text-left px-3 py-3 font-medium">New Initiatives</th>
                  <th className="text-left px-3 py-3 font-medium">Offline</th>
                  <th className="text-left px-3 py-3 font-medium">Links</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => {
                  const isEditing = editingId === c.candidateId && draft;
                  return (
                    <tr key={c.candidateId} className="border-b border-border/60 last:border-0 hover:bg-bg-elev/40 transition-colors align-top">
                      <td className="px-5 py-2.5 text-mono text-xs text-fg-muted whitespace-nowrap">
                        {isEditing ? (
                          <input value={draft.regNo} onChange={e => setDraft(d => d && ({ ...d, regNo: e.target.value }))}
                            className={cn(cellInput, "max-w-[80px]")} placeholder="Reg No." />
                        ) : (c.regNo ?? "—")}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-fg/90 whitespace-nowrap">
                        {isEditing ? (
                          <input value={draft.name} onChange={e => setDraft(d => d && ({ ...d, name: e.target.value }))}
                            className={cn(cellInput, "min-w-[140px]")} placeholder="Name *" />
                        ) : (
                          <>
                            {c.name}
                            {c.sourceUserId && (
                              <span className="ml-2 rounded-full border border-sky-500/25 bg-sky-500/10 text-sky-500 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">Roster</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-mono text-xs text-fg-muted whitespace-nowrap">
                        {isEditing ? (
                          <input value={draft.contact} onChange={e => setDraft(d => d && ({ ...d, contact: e.target.value }))}
                            className={cn(cellInput, "max-w-[110px]")} placeholder="Contact" />
                        ) : (c.contact ?? "—")}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-fg-muted whitespace-nowrap">
                        {isEditing ? (
                          <input value={draft.subject} onChange={e => setDraft(d => d && ({ ...d, subject: e.target.value }))}
                            className={cn(cellInput, "max-w-[110px]")} placeholder="Subject" />
                        ) : (c.subject ?? "—")}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-fg-muted whitespace-nowrap">
                        {isEditing ? (
                          <input value={draft.vertical} onChange={e => setDraft(d => d && ({ ...d, vertical: e.target.value }))}
                            className={cn(cellInput, "max-w-[100px]")} placeholder="Vertical" />
                        ) : (c.vertical ?? "—")}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <FlagSelect value={draft.replacement} onChange={v => setDraft(d => d && ({ ...d, replacement: v }))} />
                        ) : <Flag value={c.replacement} />}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <FlagSelect value={draft.newInitiatives} onChange={v => setDraft(d => d && ({ ...d, newInitiatives: v }))} />
                        ) : <Flag value={c.newInitiatives} />}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <FlagSelect value={draft.offlineEducators} onChange={v => setDraft(d => d && ({ ...d, offlineEducators: v }))} />
                        ) : <Flag value={c.offlineEducators} />}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input value={draft.resumeLink} onChange={e => setDraft(d => d && ({ ...d, resumeLink: e.target.value }))}
                              className={cn(cellInput, "min-w-[160px]")} placeholder="Resume URL" />
                            <input value={draft.videoLink} onChange={e => setDraft(d => d && ({ ...d, videoLink: e.target.value }))}
                              className={cn(cellInput, "min-w-[160px]")} placeholder="Video URL" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[11px]">
                            {c.resumeLink && (
                              <a href={c.resumeLink} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sky-500 hover:underline">
                                <FileText className="h-3 w-3" />Resume
                              </a>
                            )}
                            {c.videoLink && (
                              <a href={c.videoLink} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sky-500 hover:underline">
                                <Play className="h-3 w-3" />Video
                              </a>
                            )}
                            {!c.resumeLink && !c.videoLink && <span className="text-fg-dim">—</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => draft && updateMut.mutate({ candidateId: c.candidateId, ...draft })}
                              disabled={updateMut.isPending || !draft.name.trim()}
                              className="text-emerald-500 hover:bg-emerald-500/10 p-1.5 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent disabled:opacity-40"
                              title="Save Changes">
                              {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={cancelEdit}
                              className="text-fg-dim hover:text-rose-500 p-1.5 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent"
                              title="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => startEdit(c)}
                              className="text-fg-dim hover:text-emerald-500 p-1.5 hover:bg-emerald-500/10 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent"
                              title="Edit Candidate">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Remove ${c.name} from selected candidates?`)) removeMut.mutate(c.candidateId); }}
                              className="text-fg-dim hover:text-rose-500 p-1.5 hover:bg-rose-500/10 rounded-lg cursor-pointer inline-flex items-center border-none bg-transparent"
                              title="Remove">
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
        <div className="px-5 py-3 border-t border-border text-[11px] text-fg-muted shrink-0">
          Showing {candidates.length} of {q.data?.candidates?.length ?? 0} selected candidates
          {updateMut.data?.error && <span className="text-rose-500 ml-3">{updateMut.data.error}</span>}
        </div>
      </div>
    </motion.div>
  );
}
