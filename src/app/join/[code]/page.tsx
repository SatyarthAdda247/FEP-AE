"use client";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, UserPlus, XCircle, GraduationCap, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function JoinCohortPage() {
  const { code } = useParams<{ code: string }>();
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", teachingSubject: "", dob: "", videoSampleLink: "", resumeLink: "", password: "", confirm: "" });
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const inviteQ = useQuery<{ name?: string; error?: string }>({
    queryKey: ["invite", code],
    queryFn: async () => {
      const r = await fetch(`/api/join/${code}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error === "SIGNUP_CLOSED" ? "closed" : "invalid");
      return data;
    },
    retry: false,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (step === 1) {
      // Native required/type validation has passed for the detail fields — move to password step
      setStep(2);
      return;
    }
    if (draft.password !== draft.confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: code,
          name: draft.name,
          email: draft.email,
          phone: draft.phone,
          teachingSubject: draft.teachingSubject,
          dob: draft.dob,
          videoSampleLink: draft.videoSampleLink,
          resumeLink: draft.resumeLink,
          password: draft.password,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Signup failed");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass-strong rounded-3xl p-8 w-full max-w-md">
        {inviteQ.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
          </div>
        ) : inviteQ.isError ? (
          <div className="text-center py-8">
            <XCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold mb-1">
              {(inviteQ.error as Error).message === "closed" ? "Signups are closed" : "Invalid invite link"}
            </h1>
            <p className="text-sm text-fg-muted">
              {(inviteQ.error as Error).message === "closed"
                ? "This cohort is no longer accepting new members. Contact your program admin."
                : "This invite link doesn't exist or has been revoked. Double-check the URL with your admin."}
            </p>
          </div>
        ) : submitted ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold mb-1">Application submitted</h1>
            <p className="text-sm text-fg-muted">
              Thanks, {draft.name.split(" ")[0]}! Your application to join{" "}
              <span className="text-fg font-medium">{inviteQ.data?.name}</span> is now with the
              program admins. Once approved, you can log in at this site with your email and password.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted w-fit mb-4">
              <GraduationCap className="h-3 w-3" />EduSkill Program
            </div>
            <h1 className="text-xl font-semibold tracking-tight mb-1">Join {inviteQ.data?.name}</h1>
            <p className="text-sm text-fg-muted mb-4">Create your faculty account to get started.</p>

            <div className="flex items-center gap-2 mb-5 text-[10px] uppercase tracking-[0.16em]">
              <span className={step === 1 ? "text-fg font-semibold" : "text-fg-dim"}>1 · Your Details</span>
              <span className="h-px flex-1 bg-border" />
              <span className={step === 2 ? "text-fg font-semibold" : "text-fg-dim"}>2 · Set Password</span>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {step === 1 ? (
                <>
                  <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder="Full Name *" required
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
                  <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                    placeholder="Email *" type="email" required
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
                  <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                    placeholder="Phone" type="tel"
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
                  <input value={draft.teachingSubject} onChange={e => setDraft(d => ({ ...d, teachingSubject: e.target.value }))}
                    placeholder="Teaching Subject (e.g. Maths)"
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
                  <div>
                    <label className="block text-[11px] text-fg-muted mb-1 ml-1">Date of Birth *</label>
                    <input value={draft.dob} onChange={e => setDraft(d => ({ ...d, dob: e.target.value }))}
                      type="date" required max={new Date().toISOString().slice(0, 10)}
                      className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
                  </div>
                  <input value={draft.videoSampleLink} onChange={e => setDraft(d => ({ ...d, videoSampleLink: e.target.value }))}
                    placeholder="Video Sample Link (YouTube / Drive) *" type="url" required
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
                  <input value={draft.resumeLink} onChange={e => setDraft(d => ({ ...d, resumeLink: e.target.value }))}
                    placeholder="Resume Link (Drive / Dropbox) *" type="url" required
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />

                  <button type="submit"
                    className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors">
                    Continue<ArrowRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-border/60 bg-bg-elev/40 px-4 py-2.5 text-xs text-fg-muted">
                    Signing up as <span className="text-fg font-medium">{draft.name}</span> · {draft.email}
                  </div>
                  <input value={draft.password} onChange={e => setDraft(d => ({ ...d, password: e.target.value }))}
                    placeholder="Password (min 6 characters) *" type="password" required minLength={6} autoFocus
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
                  <input value={draft.confirm} onChange={e => setDraft(d => ({ ...d, confirm: e.target.value }))}
                    placeholder="Confirm Password *" type="password" required
                    className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />

                  {error && <p className="text-xs text-rose-500">{error}</p>}

                  <button type="submit" disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors disabled:opacity-40">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Create Account & Join
                  </button>
                  <button type="button" onClick={() => { setError(""); setStep(1); }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs text-fg-muted hover:text-fg transition-colors">
                    <ArrowLeft className="h-3.5 w-3.5" />Back to details
                  </button>
                </>
              )}
            </form>

            <p className="text-[11px] text-fg-muted text-center mt-4">
              Already have an account?{" "}
              <a href="/login" className="text-fg underline underline-offset-2">Log in</a>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
