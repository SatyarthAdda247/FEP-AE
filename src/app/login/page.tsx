"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { Loader2, ShieldCheck, Sparkles, Video, Users, Mail, Lock, ArrowRight, ClipboardCheck } from "lucide-react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

function CustomGrayLogo({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" fill="var(--bg-elev)" />
      <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" stroke="var(--fg-muted)" strokeWidth="2" />
      <path d="M32 25C32 21.6863 34.6863 19 38 19H44C47.3137 19 50 21.6863 50 25V75C50 78.3137 47.3137 81 44 81H38C34.6863 81 32 78.3137 32 75V25Z" fill="var(--fg-dim)" />
      <path d="M46 19H66C69.3137 19 72 21.6863 72 25C72 28.3137 69.3137 31 66 31H46V19Z" fill="var(--fg)" />
      <path d="M46 44H62C65.3137 44 68 46.6863 68 50C68 53.3137 65.3137 56 62 56H46V44Z" fill="var(--fg-muted)" />
      <path d="M46 69H66C69.3137 69 72 71.6863 72 75C72 78.3137 69.3137 81 66 81H46V69Z" fill="var(--fg)" />
      <path d="M72 40L74.5 45L80 45.5L76 49.5L77.2 55L72 52.2L66.8 55L68 49.5L64 45.5L69.5 45L72 40Z" fill="var(--fg)" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [emailLoginOpen, setEmailLoginOpen] = useState(false);
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);
    try {
      // A bare 10-digit mobile number logs in with the placeholder
      // account email used for cohorts seeded from a phone-only list.
      const identifier = /^\d{10}$/.test(emailOrPhone.trim())
        ? `${emailOrPhone.trim()}@pending.eduskill`
        : emailOrPhone.trim();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      const dest =
        data.user.role === "eduskill_admin" || data.user.role === "eduskill_manager"
          ? "/manager"
          : "/faculty";
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Login failed");
      setEmailLoading(false);
    }
  }

  const googleClientId = "210072892963-655umnn3gls5058f0d3q2uj3rv7l2p2j.apps.googleusercontent.com";

  // Track active theme state
  useEffect(() => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    setTheme(isLight ? "light" : "dark");

    // Observe theme changes dynamically
    const observer = new MutationObserver(() => {
      const isLightNow = document.documentElement.getAttribute("data-theme") === "light";
      setTheme(isLightNow ? "light" : "dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => observer.disconnect();
  }, []);

  const handleGoogleCallback = useCallback(
    async (response: { credential: string }) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Google sign-in failed");
        const dest =
          data.user.role === "eduskill_admin" ||
          data.user.role === "eduskill_manager"
            ? "/manager"
            : "/faculty";
        router.replace(dest);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed");
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    if (!googleClientId) return;

    function initGoogle() {
      window.google?.accounts.id.initialize({
        client_id: googleClientId!,
        callback: handleGoogleCallback,
        auto_select: false,
        use_fedcm_for_prompt: false,
      });
      const container = document.getElementById("google-signin-btn");
      if (container) {
        // Render Google Sign-in button with dynamic theme outline configuration
        // Using "outline" mode ensures transparent iframe background to match container background color perfectly
        window.google?.accounts.id.renderButton(container, {
          type: "standard",
          theme: theme === "light" ? "outline" : "filled_black",
          size: "large",
          width: container.offsetWidth || 340,
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
      }
      setScriptReady(true);
    }

    if (window.google?.accounts?.id) {
      initGoogle();
      return;
    }

    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", initGoogle);
      return () => existing.removeEventListener("load", initGoogle);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    script.onerror = () =>
      setError("Failed to load Google Sign-In. Please refresh the page.");
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [googleClientId, handleGoogleCallback, theme]);

  // Framer Motion staggered child animation setup
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 15 } },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen bg-bg text-fg selection:bg-brand/20 overflow-hidden relative">
      {/* Floating Background Glow Blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            x: [0, 20, 0],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-32 -left-32 w-96 h-96 bg-brand/5 rounded-full filter blur-[80px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            x: [0, -15, 0],
            y: [0, 25, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald/5 rounded-full filter blur-[80px]"
        />
      </div>

      {/* Left Column: Brand & Info — desktop only (hidden on mobile to keep it clean) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative hidden md:flex flex-col justify-between p-8 md:p-16 overflow-hidden border-r border-border bg-bg/85 backdrop-blur-md z-10"
        style={{
          backgroundImage: `
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px"
        }}
      >
        {/* Top Header */}
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 360 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="cursor-pointer"
          >
            <CustomGrayLogo className="w-10 h-10 filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.1)]" />
          </motion.div>
          <div>
            <div className="text-sm font-bold tracking-wider text-fg leading-tight">EduSkill</div>
            <div className="text-[10px] font-semibold tracking-widest text-fg-muted uppercase leading-none">PROGRAM</div>
          </div>
        </motion.div>

        {/* Center content */}
        <div className="my-auto max-w-lg py-12">
          <motion.div variants={itemVariants} className="flex items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald/20 bg-emerald/5 text-xs text-emerald font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
              Program Dashboard
            </span>
          </motion.div>

          <motion.div variants={itemVariants} className="flex items-start gap-4 mb-4">
            <motion.div 
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="w-1.5 h-16 bg-border-strong rounded-full self-stretch origin-top" 
            />
            <h1 className="text-5xl md:text-6xl font-black tracking-tight text-fg leading-none">
              EduSkill
            </h1>
          </motion.div>

          <motion.h2
            variants={itemVariants}
            className="text-xs font-bold tracking-widest text-fg-muted uppercase mb-6"
          >
            FACULTY EVALUATION & PERFORMANCE
          </motion.h2>

          <motion.p
            variants={itemVariants}
            className="text-base text-fg-muted italic mb-8 font-serif leading-relaxed"
          >
            &ldquo;Empowering educators, optimizing content.&rdquo;
          </motion.p>

          <motion.p
            variants={itemVariants}
            className="text-sm text-fg-muted/85 leading-relaxed"
          >
            Track and analyze video quality, faculty engagement, and feedback metrics in real-time.
          </motion.p>
        </div>

        {/* Bottom stats & copyright */}
        <div className="space-y-8">
          <div className="grid grid-cols-3 gap-4">
            {[
              { val: "150+", label: "FACULTIES", icon: Users },
              { val: "450+", label: "VIDEOS", icon: Video },
              { val: "300+", label: "AI ANALYSES", icon: Sparkles }
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  variants={itemVariants}
                  whileHover={{ 
                    scale: 1.03,
                    borderColor: "var(--border-strong)",
                    backgroundColor: "var(--glass-bg-s1)"
                  }}
                  className="bg-bg-card rounded-xl p-4 border border-border transition-all duration-300 group cursor-pointer shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xl md:text-2xl font-black text-fg group-hover:text-fg-muted transition-colors duration-300">
                      {stat.val}
                    </div>
                    <Icon className="h-4 w-4 text-fg-dim group-hover:text-fg transition-colors" />
                  </div>
                  <div className="text-[9px] font-bold tracking-wider text-fg-dim mt-1">
                    {stat.label}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div variants={itemVariants} className="text-[11px] text-fg-dim">
            &copy; 2026 EduSkill Program - Internal use only
          </motion.div>
        </div>
      </motion.div>

      {/* Right Column: Sign-in Form */}
      <div className="flex min-h-screen flex-col justify-center items-center px-5 py-10 md:p-16 bg-bg-elev z-10 relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-[400px]"
        >
          {/* Brand mark */}
          <div className="flex justify-center mb-6 md:mb-8">
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="relative cursor-pointer"
            >
              <CustomGrayLogo className="w-16 h-16 md:w-24 md:h-24 filter drop-shadow-[0_4px_24px_rgba(0,0,0,0.15)]" />
            </motion.div>
          </div>

          <div className="text-center mb-6 md:mb-8">
            <div className="md:hidden inline-flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/5 px-3 py-1 text-[10px] font-medium text-emerald mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
              EduSkill Program
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-fg">Sign in</h2>
            <p className="mt-2 text-sm text-fg-muted">Use your company Google account to continue.</p>
          </div>

          {/* Error display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-6 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-400 leading-relaxed"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Sign-in Card Area */}
          <motion.div 
            whileHover={{ boxShadow: "0 20px 40px -15px var(--glass-shadow)" }}
            className="bg-bg-card rounded-2xl p-6 border border-border shadow-2xl relative overflow-hidden transition-shadow duration-300"
          >
            <div className="flex flex-col items-center justify-center min-h-[60px] py-2">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
                  <span className="text-xs text-fg-muted font-medium">Verifying account…</span>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center gap-3">
                  <div id="google-signin-btn" className="w-full flex justify-center" />
                  {!scriptReady && !error && (
                    <div className="flex items-center gap-2 text-xs text-fg-dim">
                      <Loader2 className="h-3 w-3 animate-spin text-fg-muted" />
                      Loading authentication...
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {/* New-user onboarding CTA + returning-user password toggle */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider text-fg-dim">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <a
              href="/onboarding"
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm font-medium text-fg hover:border-fg/30 transition-colors"
            >
              <ClipboardCheck className="h-4 w-4" />
              New here? Set up your account
            </a>

            {!emailLoginOpen ? (
              <button
                onClick={() => setEmailLoginOpen(true)}
                className="w-full text-center text-[11px] text-fg-dim hover:text-fg-muted transition-colors"
              >
                Already set up your account? Sign in with email &amp; password
              </button>
            ) : (
              <motion.form
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleEmailLogin}
                className="space-y-3"
              >
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
                  <input
                    value={emailOrPhone}
                    onChange={(e) => setEmailOrPhone(e.target.value)}
                    placeholder="Email or 10-digit mobile number"
                    autoComplete="username"
                    required
                    className="w-full rounded-xl border border-border bg-bg-card pl-9 pr-3 py-2.5 text-sm text-fg outline-none focus:border-fg/30"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-border bg-bg-card pl-9 pr-3 py-2.5 text-sm text-fg outline-none focus:border-fg/30"
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-rose-400">{emailError}</p>
                )}
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-fg px-4 py-2.5 text-sm font-medium text-bg hover:bg-fg/90 transition-colors disabled:opacity-40"
                >
                  {emailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => { setEmailLoginOpen(false); setEmailError(""); }}
                  className="w-full text-center text-[11px] text-fg-dim hover:text-fg-muted transition-colors"
                >
                  Use Google sign-in instead
                </button>
              </motion.form>
            )}
          </div>

          {/* Security / Info Note */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 pt-6 border-t border-border"
          >
            <div className="flex gap-3 p-4 rounded-xl bg-white/[0.01] border border-border">
              <ShieldCheck className="h-5 w-5 text-fg-muted shrink-0" />
              <div className="text-xs text-fg-muted leading-relaxed">
                <span className="font-semibold text-fg">Authorized Access Only</span>
                <p className="mt-1">
                  Access is restricted to registered EduSkill faculty, program managers, and system administrators.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
