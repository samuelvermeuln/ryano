"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { signIn } from "next-auth/react";

export function GoogleSignInButton({ callbackUrl = "/entrar" }: { callbackUrl?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <motion.button
      type="button"
      onClick={() => {
        setPending(true);
        void signIn("google", { callbackUrl });
      }}
      disabled={pending}
      className="glass-button relative flex h-[56px] w-full items-center justify-center gap-3 overflow-hidden rounded-2xl px-5 py-3 text-sm font-semibold text-foreground"
      whileHover={pending ? undefined : { y: -2, scale: 1.01 }}
      whileTap={pending ? undefined : { scale: 0.99 }}
      animate={pending
        ? { boxShadow: ["0 14px 30px rgba(66, 133, 244, 0.12)", "0 18px 36px rgba(66, 133, 244, 0.18)", "0 14px 30px rgba(66, 133, 244, 0.12)"] }
        : { y: [0, -1.5, 0], boxShadow: ["0 14px 30px rgba(66, 133, 244, 0.08)", "0 18px 38px rgba(66, 133, 244, 0.14)", "0 14px 30px rgba(66, 133, 244, 0.08)"] }}
      transition={{ duration: pending ? 1.2 : 3.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
    >
      <motion.span
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-white/18 blur-xl"
        animate={{ x: ["0%", "220%"] }}
        transition={{ duration: pending ? 1.1 : 3.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", repeatDelay: pending ? 0 : 1.4 }}
        aria-hidden="true"
      />

      <motion.span
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
        animate={pending ? { scale: [1, 1.06, 1] } : { scale: [1, 1.05, 1], rotate: [0, -3, 0, 3, 0] }}
        transition={{ duration: pending ? 1 : 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        aria-hidden="true"
      >
        <GoogleLogo />
      </motion.span>

      <span className="relative inline-flex items-center gap-2">
        {pending ? <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" /> : null}
        {pending ? "Conectando com Google..." : "Continuar com Google"}
      </span>
    </motion.button>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M16.349 9.2045c0-.5146-.0462-1.0091-.1321-1.4836H9v2.8073h4.1218a3.525 3.525 0 0 1-1.5308 2.314v1.9201h2.4782c1.4507-1.3352 2.2798-3.3027 2.2798-5.5578Z" fill="#4285F4" />
      <path d="M9 16.5c2.0655 0 3.7992-.684 5.0651-1.8521l-2.4782-1.9201c-.684.459-1.5598.7292-2.5869.7292-1.9859 0-3.6694-1.3408-4.2705-3.1438H2.1673v1.9808A7.4983 7.4983 0 0 0 9 16.5Z" fill="#34A853" />
      <path d="M4.7295 10.3132A4.4938 4.4938 0 0 1 4.4909 9c0-.4566.0821-.8991.2386-1.3132V5.706H2.1673A7.4983 7.4983 0 0 0 1.5 9c0 1.2097.2896 2.3557.6673 3.294l2.5622-1.9808Z" fill="#FBBC05" />
      <path d="M9 4.5437c1.123 0 2.1321.3862 2.9262 1.1434l2.1947-2.1947C12.7964 2.2568 11.0627 1.5 9 1.5A7.4983 7.4983 0 0 0 2.1673 5.706l2.5622 1.9808C5.3306 5.8845 7.0141 4.5437 9 4.5437Z" fill="#EA4335" />
    </svg>
  );
}
