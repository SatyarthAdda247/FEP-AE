"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Phone, ShieldCheck, Lock, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import { sendOtp, verifyOtp, resendOtp } from "@/lib/msg91Widget";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendMsg, setResendMsg] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (phone.length !== 10) { setError("Enter a valid 10-digit mobile number"); return; }
    setLoading(true);
    try {
      await sendOtp(phone);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (code.length < 4) { setError("Enter the code sent to your phone"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const token = await verifyOtp(code);              // MSG91 verifies the OTP
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg91Token: token, newPassword: password }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Could not reset password."); setLoading(false); return; }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(""); setResendMsg("");
    try {
      await resendOtp();
      setResendMsg("A new code has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
    }
  }

  const fieldClass = "w-full rounded-lg border border-border bg-bg-elev px-3 py-2.5 text-sm text-fg outline-none focus:border-fg/30";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass-strong rounded-3xl p-8 w-full max-w-md">
        <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elev/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fg-muted w-fit mb-4">
          <ShieldCheck className="h-3 w-3" />Reset Password
        </div>

        {step === 1 && (
          <>
            <h1 className="text-xl font-semibold tracking-tight mb-1">Forgot your password?</h1>
            <p className="text-sm text-fg-muted mb-6">Enter your registered mobile number and we&apos;ll send a verification code.</p>
            <form onSubmit={handleSend} className="space-y-3">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
                <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number" type="tel" inputMode="numeric" required autoFocus
                  className="w-full rounded-lg border border-border bg-bg-elev pl-9 pr-3 py-2.5 text-sm text-fg outline-none focus:border-fg/30" />
              </div>
              {error && <p className="text-xs text-rose-500">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors disabled:opacity-40">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Send code
              </button>
              <p className="text-[11px] text-fg-muted text-center pt-1">
                Remembered it? <a href="/login" className="text-fg underline underline-offset-2">Back to sign in</a>
              </p>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-xl font-semibold tracking-tight mb-1">Enter the code</h1>
            <p className="text-sm text-fg-muted mb-6">We sent a code to <span className="text-fg font-medium">{phone}</span>. Enter it and choose a new password.</p>
            <form onSubmit={handleReset} className="space-y-3">
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Verification code" inputMode="numeric" required autoFocus
                className={`${fieldClass} text-center tracking-[0.4em] font-mono text-base`} />
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
                <input value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="New password (min 6 characters)" type="password" required minLength={6}
                  className="w-full rounded-lg border border-border bg-bg-elev pl-9 pr-3 py-2.5 text-sm text-fg outline-none focus:border-fg/30" />
              </div>
              <input value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm new password" type="password" required
                className={fieldClass} />
              {error && <p className="text-xs text-rose-500">{error}</p>}
              {resendMsg && <p className="text-xs text-emerald-500">{resendMsg}</p>}
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors disabled:opacity-40">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Reset password
              </button>
              <div className="flex items-center justify-between text-[11px]">
                <button type="button" onClick={handleResend} className="flex items-center gap-1 text-fg-muted hover:text-fg transition-colors">
                  <RotateCcw className="h-3 w-3" />Resend code
                </button>
                <button type="button" onClick={() => { setStep(1); setError(""); setResendMsg(""); setCode(""); }}
                  className="text-fg-dim hover:text-fg-muted transition-colors">
                  Use a different number
                </button>
              </div>
            </form>
          </>
        )}

        {step === 3 && (
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold mb-1">Password updated</h1>
            <p className="text-sm text-fg-muted mb-6">You can now sign in with your new password.</p>
            <button onClick={() => router.push("/login")}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors">
              Go to sign in
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
