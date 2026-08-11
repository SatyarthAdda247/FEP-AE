"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ClipboardCheck, Phone, ArrowRight, CheckCircle2, Info, Package } from "lucide-react";
import { INDIAN_STATES } from "@/types";
import type { User } from "@/types";

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
const TODAY = new Date().toISOString().slice(0, 10);

const fieldClass = "w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30";

type AddressDraft = {
  addressLine1: string; addressLine2: string; city: string; state: string; pincode: string; backupPhone: string;
};
const EMPTY_ADDRESS: AddressDraft = { addressLine1: "", addressLine2: "", city: "", state: "", pincode: "", backupPhone: "" };

type Draft = AddressDraft & {
  name: string; email: string; phone: string; dob: string; gender: string; tshirtSize: string;
  password: string; confirmPassword: string;
};
const EMPTY_DRAFT: Draft = { ...EMPTY_ADDRESS, name: "", email: "", phone: "", dob: "", gender: "", tshirtSize: "", password: "", confirmPassword: "" };

/** Address section shared by both onboarding variants: proper structured
 *  lines (not one free-text field) plus an info button explaining why it
 *  matters — the joining kit ships here. */
function AddressFields<T extends AddressDraft>({ value, onChange }: { value: T; onChange: (updater: (d: T) => T) => void }) {
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showInfo) return;
    function onClickOutside(e: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setShowInfo(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showInfo]);

  return (
    <div className="space-y-3">
      <div ref={infoRef} className="relative flex items-center gap-1.5">
        <label className="text-[11px] text-fg-muted">Address *</label>
        <button type="button" onClick={() => setShowInfo(s => !s)}
          className="text-fg-dim hover:text-fg transition-colors inline-flex items-center justify-center rounded-full border-none bg-transparent p-0"
          aria-label="Why we need your address">
          <Info className="h-3.5 w-3.5" />
        </button>
        {showInfo && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 top-6 z-20 w-72 rounded-xl border border-border bg-bg-card p-3 shadow-2xl">
            <div className="flex items-start gap-2">
              <Package className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-fg-muted leading-relaxed">
                Faculty who join the <span className="text-fg font-medium">EduSkill Distance Learning</span> program
                receive a joining kit delivered to this address — please make sure it&apos;s complete and accurate.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      <input value={value.addressLine1} onChange={e => onChange(d => ({ ...d, addressLine1: e.target.value }))}
        placeholder="Address Line 1 — House/Flat No., Street *" required className={fieldClass} />
      <input value={value.addressLine2} onChange={e => onChange(d => ({ ...d, addressLine2: e.target.value }))}
        placeholder="Address Line 2 — Landmark, Area (optional)" className={fieldClass} />
      <div className="grid grid-cols-2 gap-3">
        <input value={value.city} onChange={e => onChange(d => ({ ...d, city: e.target.value }))}
          placeholder="City *" required className={fieldClass} />
        <select value={value.state} onChange={e => onChange(d => ({ ...d, state: e.target.value }))} required className={fieldClass}>
          <option value="">State / UT *</option>
          {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input value={value.pincode} onChange={e => onChange(d => ({ ...d, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
          placeholder="Pincode *" required inputMode="numeric" className={fieldClass} />
        <input value={value.backupPhone} onChange={e => onChange(d => ({ ...d, backupPhone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
          placeholder="Backup Mobile No. (optional)" type="tel" inputMode="numeric" className={fieldClass} />
      </div>
    </div>
  );
}

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

            <AddressFields value={draft} onChange={updater => setDraft(d => updater(d))} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-fg-muted mb-1 ml-1">Date of Birth</label>
                <input value={draft.dob} onChange={e => setDraft(d => ({ ...d, dob: e.target.value }))}
                  type="date" max={TODAY} className={fieldClass} />
              </div>
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
  const [draft, setDraft] = useState<Omit<Draft, "password" | "confirmPassword">>({
    ...EMPTY_ADDRESS, name: "", email: "", phone: "", dob: "", gender: "", tshirtSize: "",
  });
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
        phone: u.phone ?? "",
        addressLine1: u.addressLine1 ?? "", addressLine2: u.addressLine2 ?? "",
        city: u.city ?? "", state: u.state ?? "", pincode: u.pincode ?? "", backupPhone: u.backupPhone ?? "",
        dob: u.dob ?? "", gender: u.gender ?? "", tshirtSize: u.tshirtSize ?? "",
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

            <AddressFields value={draft} onChange={updater => setDraft(d => updater(d))} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-fg-muted mb-1 ml-1">Date of Birth</label>
                <input value={draft.dob} onChange={e => setDraft(d => ({ ...d, dob: e.target.value }))}
                  type="date" max={TODAY} className={fieldClass} />
              </div>
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
