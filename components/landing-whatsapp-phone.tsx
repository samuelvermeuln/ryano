"use client";

import { useEffect, useState } from "react";
import { IconMicrophone, IconMoodSmile, IconPlus } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";

import { type SportDemo } from "@/components/landing-athlete-data";
import { SportIcon } from "@/components/icons/SportIcon";
import { useLandingExperience } from "@/components/landing-experience-context";
import { type Sport } from "@/lib/sports";

export function LandingWhatsappPhone() {
  const { athlete, direction, pauseRotation, reducedMotion, resumeRotation, selectedSport, snapshot } = useLandingExperience();
  const bubbleTheme = getBubbleTheme(athlete.bubbleStyle);

  return (
    <motion.div
      className="relative mx-auto w-[min(100%,378px)] shrink-0"
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: reducedMotion ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={pauseRotation}
      onMouseLeave={resumeRotation}
      onTouchStart={pauseRotation}
      onTouchEnd={resumeRotation}
    >
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-[70px] blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 28% 24%, oklch(0.84 0.12 215 / 0.55), transparent 34%), radial-gradient(circle at 76% 68%, oklch(0.82 0.15 165 / 0.52), transparent 42%)",
        }}
      />

      <motion.div
        className="relative overflow-hidden rounded-[48px] bg-[linear-gradient(180deg,#174b53,#12333f)] p-[10px] shadow-[0_30px_90px_rgba(7,60,82,0.34)]"
        animate={reducedMotion ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 6.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <div className="absolute left-1/2 top-3 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-[#10232a]" />

        <div className="relative aspect-[9/19] overflow-hidden rounded-[38px] bg-[#efeae2] text-[#111b21]">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(circle at 24px 24px, rgba(17,27,33,0.05) 1.5px, transparent 0), radial-gradient(circle at 76px 76px, rgba(17,27,33,0.03) 1.5px, transparent 0), linear-gradient(135deg, rgba(17,27,33,0.025) 25%, transparent 25%)",
              backgroundSize: "100px 100px, 100px 100px, 24px 24px",
            }}
          />

          <div className="relative flex items-center justify-between bg-[#075e54] px-3 pb-3 pt-8 text-white">
            <div className="flex min-w-0 gap-2.5">
              <WhatsappAvatar athleteName={athlete.name} variant={athlete.avatarStyle} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{athlete.name}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-white/78">
                  <span className="truncate">{snapshot.presenceStatus}</span>
                </div>
              </div>
            </div>
            
          </div>

          <div className="relative flex h-[calc(100%-68px)] flex-col justify-between">
            <div className="px-3 py-3">
              <IncomingMessageSequence
                key={`${athlete.name}-${selectedSport}`}
                athleteName={athlete.name}
                bubbleTheme={bubbleTheme}
                direction={direction}
                maxWeeklyTotal={Math.max(...snapshot.weeklyDays.map((day) => day.sessions.reduce((sum, session) => sum + session.durationMinutes, 0)), 1)}
                reducedMotion={reducedMotion}
                selectedSport={selectedSport}
                snapshot={snapshot}
                weeklyTotals={snapshot.weeklyDays.map((day) => day.sessions.reduce((sum, session) => sum + session.durationMinutes, 0))}
              />
            </div>

            <motion.div
              className="relative flex items-center gap-2 border-t border-black/5 bg-[#f0f2f5] px-3 py-3 mb-5"
              initial={reducedMotion ? false : { opacity: 0, y: 14 }}
              whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: reducedMotion ? 0 : 0.3, duration: reducedMotion ? 0 : 0.35 }}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#54656f] shadow-sm">
                <IconPlus size={18} stroke={1.8} aria-hidden="true" />
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] text-[#667781] shadow-sm">
                <IconMoodSmile size={16} stroke={1.8} aria-hidden="true" />
                <span className="truncate">Mensagem</span>
              </div>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25d366] text-white shadow-[0_12px_24px_rgba(37,211,102,0.28)]">
                <IconMicrophone size={18} stroke={1.9} aria-hidden="true" />
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function IncomingMessageSequence({
  athleteName,
  bubbleTheme,
  direction,
  maxWeeklyTotal,
  reducedMotion,
  selectedSport,
  snapshot,
  weeklyTotals,
}: {
  athleteName: string;
  bubbleTheme: ReturnType<typeof getBubbleTheme>;
  direction: number;
  maxWeeklyTotal: number;
  reducedMotion: boolean;
  selectedSport: Sport;
  snapshot: SportDemo;
  weeklyTotals: number[];
}) {
  const [showMessages, setShowMessages] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShowMessages(true);
    }, reducedMotion ? 220 : 980);

    return () => window.clearTimeout(timeout);
  }, [reducedMotion]);

  return (
    <div className="mt-2 min-h-[316px] space-y-2">
      <AnimatePresence mode="wait">
        {!showMessages ? (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: direction > 0 ? 12 : -12, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.24, delay: reducedMotion ? 0 : 0.05, ease: [0.22, 1, 0.36, 1] }}
              className={`max-w-[46%] rounded-[18px] px-3 py-2 shadow-[0_8px_20px_rgba(17,27,33,0.05)] ${bubbleTheme.typing}`}
            >
              <TypingBubble reducedMotion={reducedMotion} />
            </motion.div>
        ) : (
          <motion.div
            key={`${athleteName}-${selectedSport}-messages`}
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reducedMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-2"
          >
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: direction > 0 ? 18 : -18, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.36, ease: [0.22, 1, 0.36, 1] }}
              className={`max-w-[84%] rounded-[18px] px-3 py-2.5 shadow-[0_8px_20px_rgba(17,27,33,0.08)] ${bubbleTheme.report}`}
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#128c7e]">Relatório pós-atividade</p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#111b21]">
                <SportIcon sport={selectedSport} size={14} className="text-[#128c7e]" />
                <span>{snapshot.label} concluída</span>
              </p>
              <p className="mt-1 text-[10px] leading-4 text-[#54656f]">{snapshot.summary}</p>

              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl bg-[#f7fbfa] p-2">
                {snapshot.metrics.slice(0, 4).map((metric) => (
                  <Metric key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>

              <div className="mt-2 rounded-2xl bg-[#f7fbfa] p-2">
                <div className="mb-1.5 flex items-center justify-between text-[9px] font-medium text-[#667781]">
                  <span>Últimos 7 dias</span>
                  <span>{snapshot.weeklyTotalLabel}</span>
                </div>
                <div className="flex h-12 items-end gap-1.5">
                  {weeklyTotals.map((value, index) => (
                    <motion.div
                      key={`${athleteName}-${selectedSport}-${value}-${index}`}
                      className="flex-1 rounded-full bg-[linear-gradient(180deg,#34b7f1,#25d366)]"
                      initial={reducedMotion ? false : { height: 0 }}
                      animate={{ height: `${Math.max((value / maxWeeklyTotal) * 100, value > 0 ? 12 : 0)}%` }}
                      transition={{ delay: reducedMotion ? 0 : index * 0.04, duration: reducedMotion ? 0 : 0.32 }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-[#667781]">
                <span className="max-w-[78%] leading-3">{snapshot.insight}</span>
                <span>
                  {snapshot.reportTime} <span className="text-[#53bdeb]">✓✓</span>
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: direction > 0 ? 18 : -18, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.38, delay: reducedMotion ? 0 : 0.03, ease: [0.22, 1, 0.36, 1] }}
              className={`ml-auto max-w-[72%] rounded-[18px] px-3 py-2 text-[11px] leading-4 text-[#111b21] shadow-[0_8px_20px_rgba(17,27,33,0.06)] ${bubbleTheme.reply}`}
            >
              {snapshot.userReply}
              <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-[#667781]">
                {snapshot.replyTime} <span className="text-[#53bdeb]">✓✓</span>
              </div>
            </motion.div>

            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: direction > 0 ? 18 : -18, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.42, delay: reducedMotion ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}
              className={`max-w-[78%] rounded-[18px] px-3 py-2 text-[11px] leading-4 text-[#111b21] shadow-[0_8px_20px_rgba(17,27,33,0.06)] ${bubbleTheme.assistant}`}
            >
              {snapshot.assistantFollowUp}
              <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-[#667781]">{snapshot.followUpTime}</div>
            </motion.div>

            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: direction > 0 ? 18 : -18, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.38, delay: reducedMotion ? 0 : 0.03, ease: [0.22, 1, 0.36, 1] }}
              className={`ml-auto max-w-[72%] rounded-[18px] px-3 py-2 text-[11px] leading-4 text-[#111b21] shadow-[0_8px_20px_rgba(17,27,33,0.06)] ${bubbleTheme.reply}`}
            >
              <TypingStatus reducedMotion={reducedMotion} />

            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WhatsappAvatar({ athleteName, variant }: { athleteName: string; variant: "tri" | "swim" | "run" }) {
  return (
    <div className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${avatarSurface(variant)}`}>
      <div className={`absolute inset-x-1.5 top-1 h-3 rounded-full ${avatarHair(variant)}`} />
      <div className={`absolute left-1/2 top-[11px] h-5 w-5 -translate-x-1/2 rounded-full ${avatarSkin(variant)}`} />
      <div className={`absolute left-1/2 top-[24px] h-5 w-7 -translate-x-1/2 rounded-t-full ${avatarShirt(variant)}`} />
      <div className="absolute bottom-0 left-0 right-0 h-4 bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,0.12))]" />
      <span className="absolute bottom-1 right-1 rounded-full bg-white/82 px-1 py-[1px] text-[7px] font-semibold uppercase tracking-[0.08em] text-[#075e54]">
        {athleteName
          .split(" ")
          .map((part) => part[0])
          .join("")
          .slice(0, 2)}
      </span>
    </div>
  );
}

function TypingStatus({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[#667781]">
      digitando
      <span className="flex items-center gap-0.5">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-1 w-1 rounded-full bg-[#667781]"
            animate={reducedMotion ? undefined : { opacity: [0.25, 1, 0.25], y: [0, -1, 0] }}
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: index * 0.15 }}
          />
        ))}
      </span>
    </span>
  );
}

function TypingBubble({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[#7d8a92]">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-2 w-2 rounded-full bg-[#9ba8af]"
          animate={reducedMotion ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, delay: index * 0.12 }}
        />
      ))}
    </div>
  );
}

function avatarSurface(variant: "tri" | "swim" | "run") {
  if (variant === "swim") {
    return "bg-[linear-gradient(180deg,#d8d2cb,#8ca8c7)]";
  }

  if (variant === "run") {
    return "bg-[linear-gradient(180deg,#d8cabf,#b97763)]";
  }

  return "bg-[linear-gradient(180deg,#d8c5b2,#9f7457)]";
}

function avatarHair(variant: "tri" | "swim" | "run") {
  if (variant === "swim") {
    return "bg-[linear-gradient(180deg,#6d7f95,#4e6072)]";
  }

  if (variant === "run") {
    return "bg-[linear-gradient(180deg,#5b3b2e,#3a241c)]";
  }

  return "bg-[linear-gradient(180deg,#4f372a,#2f2118)]";
}

function avatarSkin(variant: "tri" | "swim" | "run") {
  if (variant === "swim") {
    return "bg-[linear-gradient(180deg,#f2d7c5,#d4ab95)]";
  }

  if (variant === "run") {
    return "bg-[linear-gradient(180deg,#f2cfb7,#cd9b84)]";
  }

  return "bg-[linear-gradient(180deg,#f5dcc8,#ddb395)]";
}

function avatarShirt(variant: "tri" | "swim" | "run") {
  if (variant === "swim") {
    return "bg-[linear-gradient(180deg,#50b7ff,#2668d7)]";
  }

  if (variant === "run") {
    return "bg-[linear-gradient(180deg,#ff9b74,#dd5d35)]";
  }

  return "bg-[linear-gradient(180deg,#6fd4ff,#36b6d7)]";
}

function getBubbleTheme(variant: "tri" | "swim" | "run") {
  if (variant === "swim") {
    return {
      report: "rounded-tl-[8px] border border-[#d8ebf8] bg-white",
      reply: "rounded-tr-[8px] bg-[#cfe8ff]",
      typing: "rounded-tl-[8px] bg-[#f7fbff]",
      assistant: "rounded-tl-[10px] border border-[#dceaf6] bg-[#fcfeff]",
    };
  }

  if (variant === "run") {
    return {
      report: "rounded-tl-[14px] border border-[#f2e4db] bg-white",
      reply: "rounded-tr-[10px] bg-[#f7ead4]",
      typing: "rounded-tl-[12px] bg-[#fffaf3]",
      assistant: "rounded-tl-[8px] border border-[#efe2d7] bg-white",
    };
  }

  return {
    report: "rounded-tl-[10px] border border-[#dce9ea] bg-white",
    reply: "rounded-tr-[10px] bg-[#d9fdd3]",
    typing: "rounded-tl-[10px] bg-white",
    assistant: "rounded-tl-[8px] border border-[#edf1f2] bg-white",
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-white px-2 py-2 shadow-[0_4px_10px_rgba(17,27,33,0.04)]">
      <p className="text-[8px] uppercase tracking-[0.16em] text-[#667781]">{label}</p>
      <p className="mt-1 text-[11px] font-semibold text-[#111b21]">{value}</p>
    </div>
  );
}
