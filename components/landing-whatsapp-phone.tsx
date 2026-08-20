"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useLandingExperience } from "@/components/landing-experience-context";

export function LandingWhatsappPhone() {
  const { athlete, direction, pauseRotation, resumeRotation, selectedSport } = useLandingExperience();
  const snapshot = athlete.sports[selectedSport] ?? athlete.sports[athlete.defaultSport]!;
  const titleEmoji = selectedSport === "swim" ? "🏊" : selectedSport === "bike" ? "🚴" : "🏃";

  return (
    <motion.div
      className="relative mx-auto w-[320px] sm:w-[378px]"
      initial={{ opacity: 0, y: 24, rotateX: 8 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
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
        animate={{ y: [0, -8, 0] }}
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
            <div className="flex min-w-0 items-center gap-2.5">
              <WhatsappAvatar athleteName={athlete.name} />
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold">{athlete.name}</p>
                <div className="flex items-center gap-1.5 text-[9px] text-white/78">
                  <span className="truncate">{snapshot.presenceStatus}</span>
                  <span className="text-white/38">•</span>
                  <TypingStatus />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-white/92">
              <HeaderIcon>
                <path d="M4 7.5h10l4 3.2V5.5a1.5 1.5 0 0 0-1.5-1.5h-11A1.5 1.5 0 0 0 4 5.5v2Z" fill="currentColor" />
                <path d="M4 9.5v5A1.5 1.5 0 0 0 5.5 16h11A1.5 1.5 0 0 0 18 14.5V12l-4-2.5H4Z" fill="currentColor" opacity="0.9" />
              </HeaderIcon>
              <HeaderIcon>
                <path d="M11.2 5.2a2 2 0 0 1 2.6.2l1 1a2 2 0 0 1 .2 2.6l-1 1.3c-.3.4-.9.6-1.4.4-.8-.3-1.8-.9-2.8-1.9-1-1-1.6-2-1.9-2.8-.2-.5 0-1 .4-1.4l1.3-1Z" fill="currentColor" />
              </HeaderIcon>
              <HeaderIcon>
                <circle cx="9" cy="9" r="1.25" fill="currentColor" />
                <circle cx="14" cy="9" r="1.25" fill="currentColor" />
                <circle cx="19" cy="9" r="1.25" fill="currentColor" />
              </HeaderIcon>
            </div>
          </div>

          <div className="relative flex h-[calc(100%-68px)] flex-col justify-between">
            <div className="space-y-2 px-3 py-3">
              <div className="mx-auto w-fit rounded-full bg-white/70 px-3 py-1 text-[8px] font-medium uppercase tracking-[0.16em] text-[#54656f] shadow-sm">
                hoje · {snapshot.reportTime}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${athlete.name}-${selectedSport}-report`}
                  initial={{ opacity: 0, x: direction > 0 ? 18 : -18, y: 8 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, x: direction > 0 ? -18 : 18, y: -4 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-[84%] rounded-[18px] rounded-tl-md bg-white px-3 py-2.5 shadow-[0_8px_20px_rgba(17,27,33,0.08)]"
                >
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#128c7e]">Relatório pós-atividade</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#111b21]">{titleEmoji} {snapshot.label} concluída</p>
                  <p className="mt-1 text-[9px] text-[#54656f]">{snapshot.summary}</p>

                  <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl bg-[#f7fbfa] p-2">
                    <Metric label={snapshot.primaryLabel} value={snapshot.primaryMetric} />
                    <Metric label={snapshot.secondaryLabel} value={snapshot.secondaryMetric} />
                    <Metric label="atleta" value={athlete.name.split(" ")[0]} />
                    <Metric label="modo" value={snapshot.label} />
                  </div>

                  <div className="mt-2 rounded-2xl bg-[#f7fbfa] p-2">
                    <div className="flex h-12 items-end gap-1.5">
                      {snapshot.weekly.map((height, index) => (
                        <motion.div
                          key={`${athlete.name}-${selectedSport}-${height}-${index}`}
                          className="flex-1 rounded-full bg-[linear-gradient(180deg,#34b7f1,#25d366)]"
                          initial={{ height: 0 }}
                          animate={{ height }}
                          transition={{ delay: index * 0.04, duration: 0.32 }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-end gap-1 text-[8px] text-[#667781]">
                    {snapshot.reportTime} <span className="text-[#53bdeb]">✓✓</span>
                  </div>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${athlete.name}-${selectedSport}-reply`}
                  initial={{ opacity: 0, x: direction > 0 ? 18 : -18, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: direction > 0 ? -18 : 18, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.38, delay: 0.03, ease: [0.22, 1, 0.36, 1] }}
                  className="ml-auto max-w-[72%] rounded-[18px] rounded-tr-md bg-[#d9fdd3] px-3 py-2 text-[10px] text-[#111b21] shadow-[0_8px_20px_rgba(17,27,33,0.06)]"
                >
                  {snapshot.userReply}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[8px] text-[#667781]">
                    {snapshot.replyTime} <span className="text-[#53bdeb]">✓✓</span>
                  </div>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${athlete.name}-${selectedSport}-typing`}
                  initial={{ opacity: 0, x: direction > 0 ? 12 : -12, y: 8 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, x: direction > 0 ? -12 : 12, y: -2 }}
                  transition={{ duration: 0.24, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-[44%] rounded-[18px] rounded-tl-md bg-white px-3 py-2 shadow-[0_8px_20px_rgba(17,27,33,0.05)]"
                >
                  <TypingBubble />
                </motion.div>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${athlete.name}-${selectedSport}-assistant`}
                  initial={{ opacity: 0, x: direction > 0 ? 18 : -18, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: direction > 0 ? -18 : 18, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.42, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-[78%] rounded-[18px] rounded-tl-md bg-white px-3 py-2 text-[10px] leading-4 text-[#111b21] shadow-[0_8px_20px_rgba(17,27,33,0.06)]"
                >
                  {snapshot.assistantFollowUp}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[8px] text-[#667781]">{snapshot.followUpTime}</div>
                </motion.div>
              </AnimatePresence>
            </div>

            <motion.div
              className="relative flex items-center gap-2 border-t border-black/5 bg-[#f0f2f5] px-3 py-3"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.35 }}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#54656f] shadow-sm">+</div>
              <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 text-[10px] text-[#667781] shadow-sm">
                <span className="text-sm">☺</span>
                <span className="truncate">Mensagem</span>
              </div>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25d366] text-sm text-white shadow-[0_12px_24px_rgba(37,211,102,0.28)]">
                🎤
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WhatsappAvatar({ athleteName }: { athleteName: string }) {
  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/18 bg-[linear-gradient(180deg,#d8c5b2,#9f7457)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
      <div className="absolute inset-x-1.5 top-1 h-3 rounded-full bg-[linear-gradient(180deg,#4f372a,#2f2118)]" />
      <div className="absolute left-1/2 top-[11px] h-5 w-5 -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,#f5dcc8,#ddb395)]" />
      <div className="absolute left-1/2 top-[24px] h-5 w-7 -translate-x-1/2 rounded-t-full bg-[linear-gradient(180deg,#6fd4ff,#36b6d7)]" />
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

function TypingStatus() {
  return (
    <span className="inline-flex items-center gap-1 text-emerald-100">
      digitando
      <span className="flex items-center gap-0.5">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-1 w-1 rounded-full bg-emerald-100"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -1, 0] }}
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: index * 0.15 }}
          />
        ))}
      </span>
    </span>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-center gap-1.5 text-[#7d8a92]">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-2 w-2 rounded-full bg-[#9ba8af]"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, delay: index * 0.12 }}
        />
      ))}
    </div>
  );
}

function HeaderIcon({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-7 w-7 place-items-center rounded-full bg-white/10">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-white px-2 py-2 shadow-[0_4px_10px_rgba(17,27,33,0.04)]">
      <p className="text-[7px] uppercase tracking-[0.16em] text-[#667781]">{label}</p>
      <p className="mt-1 text-[10px] font-semibold text-[#111b21]">{value}</p>
    </div>
  );
}
