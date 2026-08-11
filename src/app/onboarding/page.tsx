"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ClipboardCheck, Phone, ArrowRight, CheckCircle2 } from "lucide-react";
import type { User } from "@/types";

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];

const fieldClass = "w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30";

type Draft = {
  name: string; email: string; phone: string; address: string; age: string; gender: string; tshirtSize: string;
  password: string; confirmPassword: string;
};
const EMPTY_DRAFT: Draft = { name: "", email: "", phone: "", address: "", age: "", gender: "", tshirtSize: "", password: "", confirmPassword: "" };

export default function OnboardingPage() {
  const router = useRouter();

  // A rare edge case: an already-authenticated session whose profile is
  // still incomplete (e.g. an admin toggled it). Everyone else — the
  // normal case — arrives here signed out and claims their account below.
  const meQ = useQuery<{ user: { userId: string } | null }>({
    queryKey: ["onboarding-session"],
    queryFn: () => fetch("/api/auth/me").then(r => r.json()),
  });

  if (meQ.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
      </div>
    );
  }

  return meQ.data?.user ? <AuthenticatedOnboarding /> : <ClaimAccountOnboarding />;
}

/** Normal path: not signed in yet. Look the account up by phone, then
 *  fill in the rest of the profile and CREATE a password — never asks
 *  for one, since these accounts don't have one yet. */
function ClaimAccountOnboarding() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [lookupError, setLookupError] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError("");
    setLookupState("loading");
    try {
      const r = await fetch(`/api/onboarding/claim?phone=${encodeURIComponent(phone)}`);
      const data = await r.json();
      if (!r.ok) {
        setLookupError(data.error || "Could not find your account.");
        setLookupState("error");
        return;
      }
      setDraft(d => ({ ...d, name: data.name ?? "", phone: phone.replace(/\D/g, "").slice(-10) }));
      setLookupState("found");
    } catch {
      setLookupError("Something went wrong. Please try again.");
      setLookupState("error");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (draft.password.length < 6) {
      setSubmitError("Password must be at least 6 characters");
      return;
    }
    if (draft.password !== draft.confirmPassword) {
      setSubmitError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/onboarding/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await r.json();
      if (!r.ok) {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push("/faculty");
      router.refresh();
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass-strong rounded-3xl p-8 w-full max-w-lg">
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted w-fit mb-4">
          <ClipboardCheck className="h-3 w-3" />Account Setup
        </div>
        <h1 className="text-xl font-semibold tracking-tight mb-1">Set up your EduSkill account</h1>
        <p className="text-sm text-fg-muted mb-6">
          Enter the mobile number your program admin registered to get started.
        </p>

        {lookupState !== "found" ? (
          <form onSubmit={lookup} className="space-y-3">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="10-digit mobile number" type="tel" required autoFocus
                className="w-full rounded-lg border border-border bg-bg-elev pl-9 pr-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
            </div>
            {lookupError && <p className="text-xs text-rose-500">{lookupError}</p>}
            <button type="submit" disabled={lookupState === "loading"}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors disabled:opacity-40">
              {lookupState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Find my account
            </button>
            <p className="text-[11px] text-fg-muted text-center pt-2">
              Already set up your account? <a href="/login" className="text-fg underline underline-offset-2">Sign in</a>
            </p>
          </form>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Welcome, {draft.name.split(" ")[0]}! Confirm your details and create a password below.
            </div>
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Full Name *" required className={fieldClass} />
            <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
              placeholder="Email *" type="email" required className={fieldClass} />
            <div>
              <label className="block text-[11px] text-fg-muted mb-1 ml-1">Mobile Number *</label>
              <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                placeholder="Confirm or change your mobile number" type="tel" required className={fieldClass} />
            </div>
            <input value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
              placeholder="Address" className={fieldClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={draft.age} onChange={e => setDraft(d => ({ ...d, age: e.target.value.replace(/\D/g, "") }))}
                placeholder="Age" inputMode="numeric" className={fieldClass} />
              <select value={draft.gender} onChange={e => setDraft(d => ({ ...d, gender: e.target.value }))} className={fieldClass}>
                <option value="">Gender</option>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <select value={draft.tshirtSize} onChange={e => setDraft(d => ({ ...d, tshirtSize: e.target.value }))} className={fieldClass}>
              <option value="">T-Shirt Size</option>
              {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <div className="pt-2 border-t border-border">
              <p className="text-[11px] text-fg-muted mb-2 mt-3">Create a password for future sign-ins</p>
              <input value={draft.password} onChange={e => setDraft(d => ({ ...d, password: e.target.value }))}
                placeholder="Create Password (min 6 characters) *" type="password" required minLength={6} className={fieldClass} />
              <input value={draft.confirmPassword} onChange={e => setDraft(d => ({ ...d, confirmPassword: e.target.value }))}
                placeholder="Confirm Password *" type="password" required className={`${fieldClass} mt-2`} />
            </div>

            {submitError && <p className="text-xs text-rose-500">{submitError}</p>}

            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors disabled:opacity-40">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Create Account & Continue
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

/** Edge case: a session already exists (e.g. an admin flipped
 *  profileComplete on an existing logged-in user). Just confirm the
 *  profile — no password step, since this person already has one. */
function AuthenticatedOnboarding() {
  const router = useRouter();
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", address: "", age: "", gender: "", tshirtSize: "" });
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const meQ = useQuery<{ user: User }>({
    queryKey: ["onboarding-me"],
    queryFn: () => fetch("/api/onboarding").then(r => r.json()),
  });

  useEffect(() => {
    if (meQ.data?.user && !loaded) {
      const u = meQ.data.user;
      setDraft({
        name: u.name ?? "", email: u.email?.includes("@pending.eduskill") ? "" : (u.email ?? ""),
        phone: u.phone ?? "", address: u.address ?? "",
        age: u.age !== undefined ? String(u.age) : "", gender: u.gender ?? "", tshirtSize: u.tshirtSize ?? "",
      });
      setLoaded(true);
    }
  }, [meQ.data, loaded]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push("/faculty");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass-strong rounded-3xl p-8 w-full max-w-lg">
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted w-fit mb-4">
          <ClipboardCheck className="h-3 w-3" />One Last Step
        </div>
        <h1 className="text-xl font-semibold tracking-tight mb-1">Complete your profile</h1>
        <p className="text-sm text-fg-muted mb-6">Please confirm your details before continuing to the dashboard.</p>

        {meQ.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Full Name *" required className={fieldClass} />
            <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
              placeholder="Email *" type="email" required className={fieldClass} />
            <div>
              <label className="block text-[11px] text-fg-muted mb-1 ml-1">Mobile Number *</label>
              <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                placeholder="Confirm or change your mobile number" type="tel" required className={fieldClass} />
            </div>
            <input value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
              placeholder="Address" className={fieldClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={draft.age} onChange={e => setDraft(d => ({ ...d, age: e.target.value.replace(/\D/g, "") }))}
                placeholder="Age" inputMode="numeric" className={fieldClass} />
              <select value={draft.gender} onChange={e => setDraft(d => ({ ...d, gender: e.target.value }))} className={fieldClass}>
                <option value="">Gender</option>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <select value={draft.tshirtSize} onChange={e => setDraft(d => ({ ...d, tshirtSize: e.target.value }))} className={fieldClass}>
              <option value="">T-Shirt Size</option>
              {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {error && <p className="text-xs text-rose-500">{error}</p>}

            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors disabled:opacity-40">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Save & Continue
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
