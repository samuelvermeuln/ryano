"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * SAM-43 — the small health visuals shared by the athlete's dashboard and the
 * coach's/school's "Estado atual" cards. Moved verbatim from
 * `components/dashboard/dashboard-redesign.tsx` (surfaces now use theme tokens).
 */

export function AnimatedNumber({ value, reducedMotion, className }: { value: number; reducedMotion: boolean; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (reducedMotion) {
      previousValueRef.current = value;
      return;
    }

    let frame = 0;
    const start = performance.now();
    const from = previousValueRef.current;
    const duration = 520;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (value - from) * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    previousValueRef.current = value;

    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, value]);

  return <span className={className}>{new Intl.NumberFormat("pt-BR").format(reducedMotion ? value : displayValue)}</span>;
}

export function ProgressRing({ value, tone }: { value: number; tone: string }) {
  const reduceMotion = Boolean(useReducedMotion());
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const safeValue = Math.max(0, Math.min(100, value));
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--chart-grid)" strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: reduceMotion ? 0.1 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <AnimatedNumber value={Math.round(value)} reducedMotion={reduceMotion} className="text-3xl font-semibold tracking-tight text-foreground" />
      </div>
    </div>
  );
}

export function BodyBatteryBar({ low, high, reducedMotion }: { low: number | null; high: number | null; reducedMotion: boolean }) {
  const safeLow = Math.max(0, Math.min(100, low ?? 0));
  const safeHigh = Math.max(0, Math.min(100, high ?? 0));
  const left = `${Math.min(safeLow, safeHigh)}%`;
  const width = `${Math.max(Math.abs(safeHigh - safeLow), 8)}%`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-foreground/48">
        <span>0</span>
        <span>100</span>
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-border">
        <motion.div
          className="absolute inset-y-0 rounded-full bg-[linear-gradient(90deg,rgba(52,211,153,0.9),rgba(20,184,166,0.9))]"
          initial={{ left: 0, width: 0 }}
          animate={{ left, width }}
          transition={{ duration: reducedMotion ? 0.1 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

/** A tiny line of up to 28 points; gaps (missing days) are simply not drawn. */
export function Sparkline({ values, colorVar, label }: { values: Array<number | null>; colorVar: string; label: string }) {
  const present = values.filter((value): value is number => value !== null);
  if (present.length < 2) return null;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max === min ? 1 : max - min;
  const width = 120;
  const height = 32;
  const step = width / Math.max(1, values.length - 1);
  let path = "";
  let open = false;
  values.forEach((value, index) => {
    if (value === null) { open = false; return; }
    const x = index * step;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    path += `${open ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    open = true;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={`var(${colorVar})`} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
