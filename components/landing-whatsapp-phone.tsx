"use client";

import { motion } from "motion/react";

const reportMetrics = [
  { label: "Distância", value: "9,6 km" },
  { label: "Tempo", value: "48 min" },
  { label: "Pace", value: "5:00/km" },
  { label: "FC média", value: "158 bpm" },
];

const timelineMessages = [
  {
    side: "left" as const,
    title: "Relatório pós-atividade",
    body: "🏃 Corrida concluída",
    variant: "report" as const,
    time: "07:13",
  },
  {
    side: "right" as const,
    body: "Agora eu bato o olho e entendo tudo.",
    variant: "user" as const,
    time: "07:14",
  },
  {
    side: "left" as const,
    body: "Leitura rápida, métricas relevantes e sensação de progresso logo após treinar.",
    variant: "assistant" as const,
    time: "07:14",
  },
];

export function LandingWhatsappPhone() {
  return (
    <motion.div
      className="relative mx-auto w-[310px] sm:w-[360px]"
      initial={{ opacity: 0, y: 36, rotateX: 10 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-[60px] opacity-85 blur-3xl"
        animate={{
          scale: [1, 1.06, 1],
          opacity: [0.68, 0.9, 0.68],
        }}
        transition={{ duration: 7, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(circle at 45% 30%, oklch(0.75 0.16 215 / 60%), transparent 36%), radial-gradient(circle at 68% 68%, oklch(0.82 0.16 165 / 46%), transparent 44%)",
        }}
      />

      <motion.div
        className="absolute -right-4 top-10 hidden sm:block"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <div className="glass rounded-2xl border-emerald-300/16 bg-[linear-gradient(135deg,oklch(0.28_0.05_210_/_0.7),oklch(0.25_0.05_160_/_0.62))] px-3 py-2 text-xs text-foreground/86">
          <div className="flex items-center gap-2">
            <span className="relative grid h-2 w-2 place-items-center">
              <span className="absolute inset-0 rounded-full bg-emerald-400/80 animate-ping" />
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Relatório entregue
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute -left-6 bottom-24 hidden sm:block"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 5.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <div className="glass rounded-2xl border-cyan-300/14 bg-[linear-gradient(135deg,oklch(0.29_0.05_220_/_0.7),oklch(0.26_0.045_185_/_0.62))] px-3 py-2 text-xs text-foreground/84">
          48 min · 9,6 km · FC 158
        </div>
      </motion.div>

      <motion.div
        className="glass-strong relative aspect-[9/19] overflow-hidden rounded-[44px] border border-white/15 p-3 shadow-2xl"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 6.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <div className="absolute left-1/2 top-3 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-[#14303d]/80" />

        <div
          className="relative h-full w-full overflow-hidden rounded-[34px] text-white"
          style={{
            background:
              "linear-gradient(180deg, #0f4562 0%, #126779 36%, #0f7a66 100%)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage: [
                "radial-gradient(circle at 25px 25px, rgba(255,255,255,0.05) 2px, transparent 0)",
                "radial-gradient(circle at 75px 75px, rgba(255,255,255,0.03) 2px, transparent 0)",
                "linear-gradient(135deg, rgba(255,255,255,0.025) 25%, transparent 25%)",
              ].join(","),
              backgroundSize: "100px 100px, 100px 100px, 24px 24px",
            }}
          />

          <div className="relative flex items-center gap-2 bg-[linear-gradient(135deg,#1b566f,#167468)] px-3 pb-2 pt-8 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#6fd3d8]/35 text-xs font-bold text-white">
              R
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold">RYANO</div>
              <div className="truncate text-[8px] text-white/65">relatórios esportivos no WhatsApp</div>
            </div>
            <div className="rounded-full bg-[#0f3f39]/70 px-2 py-1 text-[8px] font-medium text-emerald-200">
              online
            </div>
          </div>

          <div className="relative space-y-2 p-3">
            <motion.div
              className="mx-auto w-fit rounded-full bg-[#1b4c60]/85 px-3 py-1 text-[8px] font-medium text-white/72"
              initial={{ opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              Hoje · 07:12
            </motion.div>

            {timelineMessages.map((message, index) => (
              <motion.div
                key={`${message.body}-${index}`}
                className={`flex ${message.side === "right" ? "justify-end" : "justify-start"}`}
                initial={{
                  opacity: 0,
                  x: message.side === "right" ? 26 : -26,
                  y: 12,
                }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.35 + index * 0.16,
                  duration: 0.62,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className={bubbleClassName(message.variant, message.side)}>
                  {message.variant === "report" ? (
                    <>
                      <div className="mb-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#92ecff]">
                        {message.title}
                      </div>
                      <div className="font-semibold text-white">{message.body}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-white/7 p-2 text-[9px] text-white/88">
                        {reportMetrics.map((metric) => (
                          <Metric key={metric.label} label={metric.label} value={metric.value} />
                        ))}
                      </div>
                      <div className="mt-2 h-16 rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-2">
                        <div className="flex h-full items-end gap-1.5">
                          {[36, 54, 42, 68, 50, 74, 58].map((height, barIndex) => (
                            <motion.div
                              key={`${height}-${barIndex}`}
                              className="flex-1 rounded-full bg-[linear-gradient(180deg,#9de9ff,#31d0a1)]"
                              initial={{ height: 0 }}
                              whileInView={{ height }}
                              viewport={{ once: true }}
                              transition={{ delay: 0.65 + barIndex * 0.05, duration: 0.45 }}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-2 leading-4 text-white/84">
                        Sessão consistente, boa leitura para manter a semana forte e seguir acumulando volume com controle.
                      </p>
                    </>
                  ) : (
                    <p className="leading-4 text-white/90">{message.body}</p>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[8px] text-white/60">
                    {message.time}
                    <span className={message.side === "right" ? "text-[#baf9ff]" : undefined}>✓✓</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-[linear-gradient(135deg,#1c5a73,#197062)] px-2 py-2"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.95, duration: 0.45 }}
          >
            <div className="flex flex-1 items-center gap-2 rounded-full bg-[#e4f8ff]/12 px-3 py-2 text-[10px] text-white/52">
              <span>Mensagem</span>
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#24c78b] text-xs font-semibold text-white shadow-lg">
              ➤
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function bubbleClassName(variant: "report" | "user" | "assistant", side: "left" | "right") {
  if (variant === "report") {
    return "max-w-[84%] rounded-2xl rounded-tl-md bg-[linear-gradient(180deg,#1b5168,#204b5c)] px-3 py-2 text-[10px] shadow-lg";
  }

  if (side === "right") {
    return "max-w-[78%] rounded-2xl rounded-tr-md bg-[linear-gradient(180deg,#12a777,#0e8e73)] px-3 py-2 text-[10px] shadow-lg";
  }

  return "max-w-[84%] rounded-2xl rounded-tl-md bg-[linear-gradient(180deg,#1d5e78,#21695d)] px-3 py-2 text-[10px] shadow-lg text-white/90";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/10 px-2 py-2">
      <div className="text-[8px] uppercase tracking-[0.12em] text-white/48">{label}</div>
      <div className="mt-1 text-[10px] font-semibold text-white">{value}</div>
    </div>
  );
}
