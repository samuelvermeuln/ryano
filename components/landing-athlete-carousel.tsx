"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { type Sport } from "@/components/landing-athlete-data";
import { SportIcon, sportLabel as getSportLabel } from "@/components/icons/SportIcon";
import { useLandingExperience } from "@/components/landing-experience-context";

export function LandingAthleteCarousel() {
  const {
    athlete,
    athleteIndex,
    athletes,
    availableSports,
    direction,
    goToAthlete,
    goToNextAthlete,
    goToPreviousAthlete,
    pauseRotation,
    progress,
    resumeRotation,
    selectedSport,
    setSport,
    sportOrder,
  } = useLandingExperience();
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const theme = getSportTheme(selectedSport);
  const snapshot = athlete.sports[selectedSport] ?? athlete.sports[athlete.defaultSport]!;

  const trendPath = useMemo(() => buildTrendPath(snapshot.trend, 360, 128), [snapshot.trend]);

  function handleTouchStart(clientX: number) {
    pauseRotation();
    setTouchStartX(clientX);
  }

  function handleTouchEnd(clientX: number) {
    if (touchStartX === null) {
      resumeRotation();
      return;
    }

    const delta = clientX - touchStartX;
    setTouchStartX(null);

    if (Math.abs(delta) > 42) {
      if (delta < 0) {
        goToNextAthlete();
      } else {
        goToPreviousAthlete();
      }
    }

    resumeRotation();
  }

  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Simulação visual de atletas</p>
          <p className="max-w-2xl text-sm leading-7 text-foreground/68">
            Um perfil é triatleta. Outro é focado só em natação. Outro vive corrida. Carrossel troca sozinho e mantém leitura clara.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-medium text-foreground/76">
          <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
          {snapshot.label}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.45_0.05_215_/_0.6),oklch(0.39_0.05_165_/_0.48))] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {athletes.map((entry, index) => {
                const active = index === athleteIndex;

                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => goToAthlete(index)}
                    onMouseEnter={pauseRotation}
                    onMouseLeave={resumeRotation}
                    onFocus={pauseRotation}
                    onBlur={resumeRotation}
                    className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                      active
                        ? "bg-white/18 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                        : "bg-white/8 text-foreground/68 hover:bg-white/12 hover:text-foreground"
                    }`}
                  >
                    {entry.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {sportOrder.map((sport) => {
                const active = sport === selectedSport;
                const enabled = availableSports.includes(sport);
                const label = getSportLabel(sport);

                return (
                  <button
                    key={sport}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setSport(sport)}
                    onMouseEnter={enabled ? pauseRotation : undefined}
                    onMouseLeave={enabled ? resumeRotation : undefined}
                    className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] transition ${
                      !enabled
                        ? "cursor-not-allowed border-white/6 bg-white/4 text-foreground/34"
                        : active
                          ? `${theme.button} text-foreground`
                          : "border-white/10 bg-white/6 text-foreground/68 hover:bg-white/10 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center gap-2">
              {athletes.map((entry, index) => (
                <button
                  key={entry.name}
                  type="button"
                  aria-label={`Mostrar ${entry.name}`}
                  onClick={() => goToAthlete(index)}
                  className={`h-2.5 rounded-full transition-all ${index === athleteIndex ? `w-8 ${theme.dot}` : "w-2.5 bg-white/28"}`}
                />
              ))}
            </div>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className={`h-full origin-left ${theme.dot}`}
                animate={{ scaleX: progress }}
                transition={{ duration: 0.08, ease: "linear" }}
              />
            </div>
          </div>

          <div
            className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-white/7 p-4 sm:p-5"
            onMouseEnter={pauseRotation}
            onMouseLeave={resumeRotation}
            onTouchStart={(event) => handleTouchStart(event.touches[0]?.clientX ?? 0)}
            onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={`${athlete.name}-${selectedSport}`}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                onDragStart={pauseRotation}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -64) {
                    goToNextAthlete();
                  } else if (info.offset.x > 64) {
                    goToPreviousAthlete();
                  }

                  resumeRotation();
                }}
                initial={{ opacity: 0, x: direction > 0 ? 42 : -42 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction > 0 ? -42 : 42 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch"
              >
                <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))] p-5">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-16 w-16 place-items-center rounded-[20px] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] ${theme.avatar}`}>
                      {athlete.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{athlete.name}</p>
                      <p className="mt-1 text-sm text-foreground/68">{athlete.role}</p>
                      <p className="mt-1 text-xs text-foreground/56">{athlete.city}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <InfoPill value={snapshot.primaryMetric} label={snapshot.primaryLabel} />
                    <InfoPill value={snapshot.secondaryMetric} label={snapshot.secondaryLabel} />
                  </div>

                  <div className="mt-5 rounded-[22px] border border-white/10 bg-white/8 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/62">leitura do perfil</p>
                    <p className="mt-2 text-sm leading-7 text-foreground/84">{athlete.accent}</p>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {snapshot.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/74"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Resumo visual do dia</p>
                        <p className="mt-1 text-xs text-foreground/64">{snapshot.summary}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium text-white ${theme.badge}`}>
                        {snapshot.label}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <SportSceneCard sport="swim" active={selectedSport === "swim"} enabled={availableSports.includes("swim")} />
                      <SportSceneCard sport="bike" active={selectedSport === "bike"} enabled={availableSports.includes("bike")} />
                      <SportSceneCard sport="run" active={selectedSport === "run"} enabled={availableSports.includes("run")} />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <PerformanceCard
                      title="Evolução semanal"
                      subtitle="Carga distribuída da semana"
                      badge="7 dias"
                    >
                      <BarPerformanceChart values={snapshot.weekly} labels={["S", "T", "Q", "Q", "S", "S", "D"]} theme={theme} />
                    </PerformanceCard>

                    <PerformanceCard
                      title="Evolução mensal"
                      subtitle="Tendência de consistência"
                      badge="30 dias"
                    >
                      <LinePerformanceChart path={trendPath.line} areaPath={trendPath.area} theme={theme} />
                    </PerformanceCard>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildTrendPath(values: readonly number[], width: number, height: number) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / (max - min || 1)) * (height - 20) - 10;
    return { x, y };
  });

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return { line, area };
}

function PerformanceCard({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/8 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-foreground/64">{subtitle}</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">{badge}</span>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function BarPerformanceChart({
  values,
  labels,
  theme,
}: {
  values: readonly number[];
  labels: readonly string[];
  theme: SportTheme;
}) {
  const peak = Math.max(...values);
  const mid = Math.round(peak / 2);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
        <div className="flex h-40 flex-col justify-between pb-6 text-[10px] font-medium text-foreground/52">
          <span>{peak}</span>
          <span>{mid}</span>
          <span>0</span>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/8" />
          <div className="pointer-events-none absolute inset-x-0 bottom-6 h-px bg-white/10" />
          <div className="flex h-40 items-end gap-3">
            {values.map((value, index) => (
              <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                <div className="relative flex h-full w-full items-end rounded-[18px] bg-white/6 p-1">
                  <motion.div
                    className={`w-full rounded-[14px] ${theme.bar}`}
                    initial={{ height: 0 }}
                    animate={{ height: `${value}%` }}
                    transition={{ duration: 0.55, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="text-[10px] font-medium text-foreground/62">{labels[index]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/64">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
          volume semanal por sessão
        </div>
        <span>eixo Y · carga</span>
      </div>
    </div>
  );
}

function LinePerformanceChart({
  path,
  areaPath,
  theme,
}: {
  path: string;
  areaPath: string;
  theme: SportTheme;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
        <div className="flex h-36 flex-col justify-between pt-1 text-[10px] font-medium text-foreground/52">
          <span>alto</span>
          <span>médio</span>
          <span>base</span>
        </div>
        <svg viewBox="0 0 360 128" className="h-36 w-full overflow-visible">
          <path d="M0 118 H360" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <path d="M0 64 H360" stroke="rgba(255,255,255,0.09)" strokeWidth="1" strokeDasharray="4 6" />
          <path d="M0 10 H360" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 6" />
          <motion.path
            d={areaPath}
            className={theme.fillClass}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.42 }}
            transition={{ duration: 0.4 }}
          />
          <motion.path
            d={path}
            fill="none"
            className={theme.strokeClass}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/64">
        <div className="grid grid-cols-4 gap-2 text-[10px] font-medium text-foreground/62 sm:grid-cols-6">
          {["sem 1", "sem 2", "sem 3", "sem 4", "pico", "agora"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <span>eixo X · tendência</span>
      </div>
    </div>
  );
}

function InfoPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/8 px-4 py-4">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/62">{label}</p>
    </div>
  );
}

function SportSceneCard({
  sport,
  active,
  enabled,
}: {
  sport: Sport;
  active: boolean;
  enabled: boolean;
}) {
  const theme = getSportTheme(sport);

  return (
    <div
      className={`rounded-[20px] border p-4 transition ${
        !enabled
          ? "border-white/6 bg-white/4 opacity-45"
          : active
            ? `border-white/18 ${theme.scene}`
            : "border-white/10 bg-white/6"
      }`}
    >
      <div className={`grid h-12 w-12 place-items-center rounded-[16px] text-white ${theme.avatar}`}>
        <SportIcon sport={sport} size={26} className="text-current" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{getSportLabel(sport)}</p>
      <p className="mt-1 text-xs text-foreground/62">
        {enabled ? (active ? "modalidade ativa" : "disponível" ) : "indisponível neste perfil"}
      </p>
    </div>
  );
}

type SportTheme = {
  dot: string;
  button: string;
  avatar: string;
  badge: string;
  bar: string;
  strokeClass: string;
  fillClass: string;
  scene: string;
};

function getSportTheme(sport: Sport): SportTheme {
  if (sport === "swim") {
    return {
      dot: "bg-[var(--sport-swimming-dark)]",
      button: "border-[color:var(--sport-swimming-dark)]/30 bg-[color:var(--sport-swimming-dark)]/18",
      avatar: "bg-[linear-gradient(135deg,var(--sport-swimming-light),var(--sport-swimming-dark))]",
      badge: "bg-[linear-gradient(135deg,var(--sport-swimming-light),var(--sport-swimming-dark))]",
      bar: "bg-[linear-gradient(180deg,var(--sport-swimming-dark),var(--sport-swimming-light))]",
      strokeClass: "stroke-[var(--sport-swimming-dark)]",
      fillClass: "fill-[color:var(--sport-swimming-dark)]/30",
      scene: "bg-[color:var(--sport-swimming-dark)]/12",
    };
  }

  if (sport === "bike") {
    return {
      dot: "bg-[var(--sport-cycling-dark)]",
      button: "border-[color:var(--sport-cycling-dark)]/30 bg-[color:var(--sport-cycling-dark)]/18",
      avatar: "bg-[linear-gradient(135deg,var(--sport-cycling-light),var(--sport-cycling-dark))]",
      badge: "bg-[linear-gradient(135deg,var(--sport-cycling-light),var(--sport-cycling-dark))]",
      bar: "bg-[linear-gradient(180deg,var(--sport-cycling-dark),var(--sport-cycling-light))]",
      strokeClass: "stroke-[var(--sport-cycling-dark)]",
      fillClass: "fill-[color:var(--sport-cycling-dark)]/30",
      scene: "bg-[color:var(--sport-cycling-dark)]/12",
    };
  }

  return {
    dot: "bg-[var(--sport-running-dark)]",
    button: "border-[color:var(--sport-running-dark)]/30 bg-[color:var(--sport-running-dark)]/18",
    avatar: "bg-[linear-gradient(135deg,var(--sport-running-light),var(--sport-running-dark))]",
    badge: "bg-[linear-gradient(135deg,var(--sport-running-light),var(--sport-running-dark))]",
    bar: "bg-[linear-gradient(180deg,var(--sport-running-dark),var(--sport-running-light))]",
    strokeClass: "stroke-[var(--sport-running-dark)]",
    fillClass: "fill-[color:var(--sport-running-dark)]/28",
    scene: "bg-[color:var(--sport-running-dark)]/12",
  };
}
