"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import type { ArchiveVideoLog } from "@/types/archive";
import { scoreColor, extractYouTubeId, cn } from "@/lib/utils";
import { SpreadsheetTable, type SheetColumn } from "@/components/SpreadsheetTable";

interface LiveRow {
  trainee: string;
  date: string | null;
  link: string;
  title: string;
  subject: string;
  boardWork: number | null;
  visualTLM: number | null;
  energy: number | null;
  delivery: number | null;
  hook: number | null;
  managerTotal: number | null;
  managerName?: string | null;
  gradiScore: number | null;
  gradiContrib: number | null;
  combinedTotal: number | null;
  status: string;
  videoId: string;
}

interface Props {
  rows: ArchiveVideoLog[];
  editMode?: boolean;
  onUpdate?: (rows: ArchiveVideoLog[]) => void;
}

const HISTORICAL_COLS: SheetColumn<ArchiveVideoLog>[] = [
  { key: "trainee", label: "Trainee", width: "160px" },
  { key: "date", label: "Date", width: "110px" },
  { key: "boardWork", label: "Board", type: "number", width: "70px", align: "right" },
  { key: "visualTLM", label: "TLM", type: "number", width: "70px", align: "right" },
  { key: "energy", label: "Energy", type: "number", width: "70px", align: "right" },
  { key: "delivery", label: "Delivery", type: "number", width: "70px", align: "right" },
  { key: "hook", label: "Hook", type: "number", width: "70px", align: "right" },
  {
    key: "total", label: "Total", type: "readonly", width: "70px", align: "right",
    format: (v) => v == null ? "—" : String(v),
  },
  { key: "notes", label: "Notes", width: "200px" },
];

const BLANK_ROW: ArchiveVideoLog = {
  trainee: "", date: null, link: "", boardWork: null, visualTLM: null,
  energy: null, delivery: null, hook: null, total: null, notes: "",
};

export function VideoLogSection({ rows, editMode, onUpdate }: Props) {
  const [tab, setTab] = useState<"live" | "historical">("live");

  const liveQ = useQuery<{ rows: LiveRow[] }>({
    queryKey: ["live-videolog"],
    queryFn: () => fetch("/api/archive/videolog").then(r => r.json()),
    staleTime: 30_000,
    enabled: tab === "live",
  });

  // Auto-calculate total when rows change
  function handleRowsChange(updated: ArchiveVideoLog[]) {
    const withTotals = updated.map(r => {
      const params = [r.boardWork, r.visualTLM, r.energy, r.delivery, r.hook];
      const total = params.every(v => v != null) ? params.reduce((a, b) => (a ?? 0) + (b ?? 0), 0) : null;
      return { ...r, total };
    });
    onUpdate?.(withTotals);
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-bg-elev/50 p-1 w-fit">
        {(["live", "historical"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-xs font-medium transition-all",
              tab === t
                ? "bg-fg text-bg shadow-sm"
                : "text-fg-muted hover:text-fg"
            )}>
            {t === "live" ? "Live (Dashboard)" : "Historical (Seeded)"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "live" ? (
            <LiveVideoLog data={liveQ.data?.rows ?? []} loading={liveQ.isLoading} refetch={liveQ.refetch} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-fg-muted">
                  <span className="text-mono text-fg/85">{rows.length}</span> entries from the original program cohort
                </p>
                <p className="text-[11px] text-fg-muted">
                  Avg: <span className="text-mono text-fg/85">
                    {rows.filter(r => r.total != null).length > 0
                      ? (rows.reduce((a, r) => a + (r.total ?? 0), 0) / rows.filter(r => r.total != null).length).toFixed(1)
                      : "—"}
                  </span>/25
                </p>
              </div>
              <SpreadsheetTable
                columns={HISTORICAL_COLS as unknown as SheetColumn<Record<string, unknown>>[]}
                rows={rows as unknown as Record<string, unknown>[]}
                onRowsChange={(updated) => handleRowsChange(updated as unknown as ArchiveVideoLog[])}
                rowTemplate={BLANK_ROW as unknown as Record<string, unknown>}
                readOnly={!editMode}
                maxHeight="65vh"
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LiveVideoLog({ data, loading, refetch }: { data: LiveRow[]; loading: boolean; refetch: () => void }) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
      </div>
    );
  }
 
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="text-sm text-fg-muted">No scored videos yet.</p>
        <p className="text-[11px] text-fg-dim mt-1">Score videos in the Manager dashboard to populate this.</p>
      </div>
    );
  }
 
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-fg-muted">
          <span className="text-mono text-fg/85">{data.length}</span> videos from the live dashboard
        </p>
        <button onClick={refetch} className="flex items-center gap-1.5 text-[11px] text-fg-muted hover:text-fg transition-colors">
          <RefreshCw className="h-3 w-3" />Refresh
        </button>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div style={{ overflowX: "auto", maxHeight: "65vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg-elev)", zIndex: 2 }}>
                {["Trainee", "Date", "Subject", "Board", "TLM", "Energy", "Delivery", "Hook", "Manager /25", "Status", "Link"].map(h => (
                  <th key={h} style={{
                    padding: "8px 12px",
                    textAlign: ["Trainee", "Date", "Subject", "Status"].includes(h) ? "left" : "right",
                    fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
                    color: "var(--fg-muted)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const hasRating = r.managerTotal != null;
                const hasGradi = r.gradiScore != null;
                return (
                  <motion.tr key={r.videoId}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.3) }}
                    style={{ borderBottom: "1px solid var(--border)" }}
                    className="hover:bg-bg-elev/40 transition-colors"
                  >
                    <td style={{ padding: "6px 12px", fontWeight: 500, color: "var(--fg)", whiteSpace: "nowrap" }}>{r.trainee}</td>
                    <td style={{ padding: "6px 12px", color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{r.date ?? "—"}</td>
                    <td style={{ padding: "6px 12px", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      <span style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "1px 8px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{r.subject}</span>
                    </td>
                    {([r.boardWork, r.visualTLM, r.energy, r.delivery, r.hook] as (number | null)[]).map((v, j) => (
                      <td key={j} style={{ padding: "6px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: v != null ? scoreColor(v) : "var(--fg-dim)" }}>
                        {v != null ? v.toFixed(1) : "—"}
                      </td>
                    ))}
                    <ScoreCell value={r.managerTotal} max={25} na={!hasRating} managerName={r.managerName} />
                    {/* <ScoreCell value={r.gradiContrib} max={25} na={!hasGradi} /> */}
                    {/* <ScoreCell value={r.combinedTotal} max={50} na={!hasRating && !hasGradi} bold /> */}
                    <td style={{ padding: "6px 12px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.08em",
                        color: r.status === "manager_rated" ? "var(--emerald)" : r.status === "gradi_done" ? "#a78bfa" : r.status === "analyzing" ? "var(--amber)" : "var(--fg-muted)",
                        background: r.status === "manager_rated" ? "color-mix(in srgb, var(--emerald) 12%, transparent)" : r.status === "gradi_done" ? "rgba(167,139,250,0.12)" : r.status === "analyzing" ? "color-mix(in srgb, var(--amber) 12%, transparent)" : "var(--bg-elev)",
                        border: `1px solid ${r.status === "manager_rated" ? "color-mix(in srgb, var(--emerald) 25%, transparent)" : r.status === "gradi_done" ? "rgba(167,139,250,0.25)" : "var(--border)"}`,
                      }}>
                        {r.status === "manager_rated" ? "manager scored" : r.status?.replace("_", " ") ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "center" }}>
                      {extractYouTubeId(r.link) ? (
                        <a href={r.link} target="_blank" rel="noopener noreferrer"
                          style={{ color: "var(--fg-muted)", display: "inline-flex", alignItems: "center" }}
                          className="hover:text-fg transition-colors">
                          <ExternalLink style={{ width: 12, height: 12 }} />
                        </a>
                      ) : <span style={{ color: "var(--fg-dim)" }}>—</span>}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ScoreCell({ value, max, na, bold, managerName }: { value: number | null; max: number; na: boolean; bold?: boolean; managerName?: string | null }) {
  const color = value != null ? scoreColor(value / (max / 5)) : "var(--fg-dim)";
  return (
    <td style={{
      padding: "6px 12px", textAlign: "right",
      fontFamily: "var(--font-mono)", fontWeight: bold ? 700 : 500,
      color: na ? "var(--fg-dim)" : color,
      fontSize: bold ? 13 : 12,
    }}>
      {na ? "—" : (
        <div className="flex flex-col items-end">
          <span>{value}</span>
          {managerName && (
            <span className="text-[9px] text-fg-muted font-normal font-sans" title={`Rated by ${managerName}`}>
              by {managerName.split(" ")[0]}
            </span>
          )}
        </div>
      )}
    </td>
  );
}
