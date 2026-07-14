"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Check,
  Users,
  Activity,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signInWithCredentials,
} from "@/features/authentication/api/sign-in-actions";
import { EagleLogo } from "@/shared/components/brand/eagle-logo";
import { GoogleIcon, MicrosoftIcon } from "@/shared/components/brand/provider-icons";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";

const features = [
  { icon: Users, title: "Team Collaboration", desc: "Work together seamlessly" },
  { icon: Activity, title: "Real-time Tracking", desc: "Stay updated with real-time insights" },
  { icon: ShieldCheck, title: "Enterprise Ready", desc: "Secure, scalable and built for teams" },
];

function fade(delay: number) {
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as const },
  };
}

export function SignInScreen({ error }: { error?: string }) {
  const errorMessage = mapAuthError(error);

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120]">
      <ThemeToggle className="fixed right-6 top-6 z-20" />

      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <BrandPanel />
        <FormPanel errorMessage={errorMessage} />
      </div>
    </div>
  );
}

/* ------------------------------- Left ------------------------------- */

function BrandPanel() {
  return (
    <section className="relative hidden flex-col justify-between overflow-hidden px-14 py-12 lg:flex lg:w-2/5">
      <motion.div {...fade(0)} className="flex items-start gap-3.5">
        <EagleLogo className="h-12 w-12" />
        <div>
          <div className="text-2xl font-bold tracking-tight text-foreground">EAGLES</div>
          <p className="mt-0.5 max-w-[220px] text-[13px] leading-snug text-muted-foreground">
            Enterprise Agile Governance, Lifecycle &amp; Execution System
          </p>
        </div>
      </motion.div>

      <div className="max-w-[440px]">
        <motion.h1
          {...fade(0.08)}
          className="text-[44px] font-bold leading-[1.08] tracking-tight text-foreground"
        >
          Plan. Track. Deliver.
          <br />
          All in one place.
        </motion.h1>
        <motion.p {...fade(0.14)} className="mt-5 text-[17px] leading-relaxed text-muted-foreground">
          EAGLES helps teams collaborate, manage projects and ship great work
          — faster.
        </motion.p>

        <motion.div {...fade(0.2)} className="mt-10">
          <GlassIllustration />
        </motion.div>

        <motion.ul {...fade(0.28)} className="mt-10 grid grid-cols-3 gap-4">
          {features.map((f) => (
            <li key={f.title}>
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
                <f.icon className="h-5 w-5 text-accent" strokeWidth={1.9} />
              </span>
              <p className="text-[13px] font-semibold text-foreground">{f.title}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{f.desc}</p>
            </li>
          ))}
        </motion.ul>
      </div>

      <motion.div
        {...fade(0.36)}
        className="flex items-center gap-6 text-[12px] text-muted-foreground"
      >
        <span>© 2026 EAGLES. All rights reserved.</span>
        <span className="flex gap-4">
          <button className="transition-colors hover:text-foreground">Privacy</button>
          <button className="transition-colors hover:text-foreground">Terms</button>
          <button className="transition-colors hover:text-foreground">Help</button>
        </span>
      </motion.div>
    </section>
  );
}

function GlassIllustration() {
  const cards = [
    { icon: BarChart3, x: "left-0 top-8", z: "z-0", accent: false, delay: 0 },
    { icon: Check, x: "left-1/2 top-0 -translate-x-1/2", z: "z-10", accent: true, delay: 0.6 },
    { icon: Users, x: "right-0 top-8", z: "z-0", accent: false, delay: 1.2 },
  ];
  return (
    <div className="relative mx-auto h-[190px] w-full max-w-[380px]">
      <div className="absolute bottom-6 left-1/2 h-8 w-[280px] -translate-x-1/2 rounded-[50%] bg-accent/15 blur-2xl" />
      <div className="absolute bottom-8 left-1/2 h-16 w-[300px] -translate-x-1/2 rounded-3xl border border-white/60 bg-white/40 backdrop-blur-md dark:border-white/10 dark:bg-white/5" />
      {cards.map((c, i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -9, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: c.delay }}
          className={cn("absolute flex h-[86px] w-[86px] items-center justify-center rounded-2xl border backdrop-blur-md", c.x, c.z,
            c.accent
              ? "border-white/30 bg-accent text-white shadow-xl shadow-accent/25"
              : "border-white/70 bg-white/55 text-accent shadow-lg dark:border-white/10 dark:bg-white/5",
          )}
        >
          <c.icon className="h-8 w-8" strokeWidth={2} />
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------- Right ------------------------------ */

function FormPanel({ errorMessage }: { errorMessage: string | null }) {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-12 lg:w-3/5">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[560px] rounded-3xl bg-background p-8 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.18)] ring-1 ring-border/60 sm:p-12"
      >
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <EagleLogo className="h-9 w-9" />
          <span className="text-lg font-bold tracking-tight text-foreground">EAGLES</span>
        </div>

        <h2 className="text-[30px] font-bold tracking-tight text-foreground">Welcome back</h2>
        <p className="mt-1.5 text-[15px] text-muted-foreground">Sign in to continue to EAGLES</p>

        {errorMessage && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        <div className="mt-8 space-y-3">
          <form action={signInWithGoogle}>
            <ProviderButton icon={<GoogleIcon className="h-5 w-5" />} label="Continue with Google" />
          </form>
          <form action={signInWithMicrosoft}>
            <ProviderButton icon={<MicrosoftIcon className="h-5 w-5" />} label="Continue with Microsoft" />
          </form>
        </div>

        <div className="my-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[13px] text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <CredentialsForm />

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <button
            onClick={() =>
              toast.info("New accounts are created by your workspace administrator.")
            }
            className="font-semibold text-accent transition-opacity hover:opacity-80"
          >
            Contact administrator
          </button>
        </p>
      </motion.div>
    </section>
  );
}

function ProviderButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Button
      type="submit"
      variant="outline"
      className="relative h-14 w-full rounded-xl text-[15px] font-medium"
    >
      <span className="absolute left-5 flex items-center">{icon}</span>
      {label}
    </Button>
  );
}

function CredentialsForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={signInWithCredentials} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
          Email address
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@company.com"
          className="h-14 rounded-xl text-[15px]"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-foreground">
          Password
        </label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            className="h-14 rounded-xl pr-12 text-[15px]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 rounded"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
          <Checkbox name="remember" defaultChecked />
          Remember me
        </label>
        <button
          type="button"
          onClick={() =>
            toast.info("Password resets are handled by your workspace administrator.")
          }
          className="text-sm font-semibold text-accent transition-opacity hover:opacity-80"
        >
          Forgot password?
        </button>
      </div>

      <Button type="submit" className="h-14 w-full rounded-xl text-[15px] font-semibold">
        Sign in with email
      </Button>
    </form>
  );
}

function mapAuthError(code?: string): string | null {
  switch (code) {
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "AccessDenied":
      return "Sign-in was rejected. Contact your admin if you believe this is an error.";
    case "Default":
      return "Sign-in failed. Please try again.";
    default:
      return null;
  }
}
