"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ClipboardCheck } from "lucide-react";
import type { User } from "@/types";

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];

export default function OnboardingPage() {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: "", email: "", phone: "", address: "", age: "", gender: "", tshirtSize: "",
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
        <p className="text-sm text-fg-muted mb-6">
          Please confirm your details before continuing to the dashboard.
        </p>

        {meQ.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-fg-muted" />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Full Name *" required
              className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
            <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
              placeholder="Email *" type="email" required
              className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
            <div>
              <label className="block text-[11px] text-fg-muted mb-1 ml-1">Mobile Number *</label>
              <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                placeholder="Confirm or change your mobile number" type="tel" required
                className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
            </div>
            <input value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
              placeholder="Address"
              className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
            <div className="grid grid-cols-2 gap-3">
              <input value={draft.age} onChange={e => setDraft(d => ({ ...d, age: e.target.value.replace(/\D/g, "") }))}
                placeholder="Age" inputMode="numeric"
                className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30" />
              <select value={draft.gender} onChange={e => setDraft(d => ({ ...d, gender: e.target.value }))}
                className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30">
                <option value="">Gender</option>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <select value={draft.tshirtSize} onChange={e => setDraft(d => ({ ...d, tshirtSize: e.target.value }))}
              className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-fg outline-none focus:border-fg/30">
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
