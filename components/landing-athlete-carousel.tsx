"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Sport = "swim" | "bike" | "run";

type SportSnapshot = {
  label: string;
  summary: string;
  primaryMetric: string;
  primaryLabel: string;
  secondaryMetric: string;
  secondaryLabel: string;
  weekly: readonly number[];
  trend: readonly number[];
  chips: readonly string[];
};

type Athlete = {
  name: string;
  role: string;
  city: string;
  accent: string;
  sports: Record<Sport, SportSnapshot>;
};

const sportOrder: readonly Sport[] = ["swim", "bike", "run"];

const athletes: readonly Athlete[] = [
  {
    name: "Ryvano Souza",
    role: "Triatleta de rotina",
    city: "São Paulo · SP",
    accent: "volume estável e leitura rápida do pós-treino",
    sports: {
      swim: {
        label: "Natação",
        summary: "Bloco de técnica com ritmo firme e boa consistência na água.",
        primaryMetric: "2,4 km",
        primaryLabel: "distância",
        secondaryMetric: "1:48/100m",
        secondaryLabel: "pace médio",
        weekly: [36, 44, 40, 62, 52, 68, 58],
        trend: [24, 28, 31, 35, 38, 42, 47, 49, 52, 54, 58, 61],
        chips: ["técnica", "cadência", "consistência"],
      },
      bike: {
        label: "Bike",
        summary: "Sessão longa com ganho de resistência e leitura clara de volume.",
        primaryMetric: "58 km",
        primaryLabel: "distância",
        secondaryMetric: "31,2 km/h",
        secondaryLabel: "velocidade",
        weekly: [52, 70, 58, 88, 74, 90, 66],
        trend: [33, 36, 40, 43, 47, 49, 54, 58, 60, 65, 69, 74],
        chips: ["resistência", "potência", "longão"],
      },
      run: {
        label: "Corrida",
        summary: "Treino leve para forte com ritmo limpo e recuperação controlada.",
        primaryMetric: "12,1 km",
        primaryLabel: "distância",
        secondaryMetric: "4:48/km",
        secondaryLabel: "pace médio",
        weekly: [48, 64, 54, 84, 68, 80, 60],
        trend: [29, 34, 37, 41, 45, 48, 51, 55, 59, 63, 67, 71],
        chips: ["ritmo", "constância", "pós-treino"],
      },
    },
  },
  {
    name: "Elisa Santos",
    role: "Triatleta focada em performance",
    city: "Belo Horizonte · MG",
    accent: "semana forte com equilíbrio entre cardio e recuperação",
    sports: {
      swim: {
        label: "Natação",
        summary: "Série progressiva com técnica bem sustentada do início ao fim.",
        primaryMetric: "2,1 km",
        primaryLabel: "distância",
        secondaryMetric: "1:52/100m",
        secondaryLabel: "pace médio",
        weekly: [34, 42, 37, 58, 48, 64, 54],
        trend: [21, 24, 27, 32, 36, 39, 43, 46, 48, 53, 56, 60],
        chips: ["base", "controle", "fluidez"],
      },
      bike: {
        label: "Bike",
        summary: "Treino de subida com ganho claro de ritmo e capacidade de giro.",
        primaryMetric: "46 km",
        primaryLabel: "distância",
        secondaryMetric: "29,6 km/h",
        secondaryLabel: "velocidade",
        weekly: [44, 62, 52, 78, 70, 86, 63],
        trend: [26, 30, 35, 39, 42, 46, 50, 53, 57, 62, 66, 70],
        chips: ["subida", "cadência", "endurance"],
      },
      run: {
        label: "Corrida",
        summary: "Rodagem de qualidade com ritmo sustentado e sensação de controle.",
        primaryMetric: "9,8 km",
        primaryLabel: "distância",
        secondaryMetric: "5:02/km",
        secondaryLabel: "pace médio",
        weekly: [42, 56, 48, 74, 62, 78, 58],
        trend: [22, 25, 29, 34, 37, 42, 45, 49, 54, 57, 61, 66],
        chips: ["rodagem", "ritmo", "controle"],
      },
    },
  },
  {
    name: "Rosa Maria",
    role: "Atleta master em evolução",
    city: "Curitiba · PR",
    accent: "ganho visual de constância sem sobrecarregar leitura",
    sports: {
      swim: {
        label: "Natação",
        summary: "Sessão contínua com técnica limpa e bom encaixe de respiração.",
        primaryMetric: "1,8 km",
        primaryLabel: "distância",
        secondaryMetric: "1:57/100m",
        secondaryLabel: "pace médio",
        weekly: [28, 36, 34, 48, 44, 57, 49],
        trend: [18, 20, 23, 27, 31, 34, 38, 41, 45, 48, 51, 55],
        chips: ["técnica", "controle", "progressão"],
      },
      bike: {
        label: "Bike",
        summary: "Pedal estável com boa entrega de volume e leitura simples de progresso.",
        primaryMetric: "38 km",
        primaryLabel: "distância",
        secondaryMetric: "27,4 km/h",
        secondaryLabel: "velocidade",
        weekly: [38, 50, 46, 68, 60, 76, 57],
        trend: [20, 23, 28, 32, 35, 39, 43, 47, 50, 55, 58, 63],
        chips: ["cadência", "fôlego", "evolução"],
      },
      run: {
        label: "Corrida",
        summary: "Corrida contínua com percepção visual clara de evolução semanal.",
        primaryMetric: "8,4 km",
        primaryLabel: "distância",
        secondaryMetric: "5:18/km",
        secondaryLabel: "pace médio",
        weekly: [36, 46, 42, 62, 56, 72, 54],
        trend: [19, 22, 26, 30, 33, 37, 41, 45, 49, 53, 57, 62],
        chips: ["base", "rotina", "hábito"],
      },
    },
  },
];

export function LandingAthleteCarousel() {
  const [athleteIndex, setAthleteIndex] = useState(0);
  const [selectedSport, setSelectedSport] = useState<Sport>("run");
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDirection(1);
      setAthleteIndex((current) => (current + 1) % athletes.length);
    }, 4600);

    return () => window.clearInterval(interval);
  }, []);

  const athlete = athletes[athleteIndex];
  const snapshot = athlete.sports[selectedSport];
  const activeSportIndex = sportOrder.indexOf(selectedSport);

  const trendPath = useMemo(() => buildTrendPath(snapshot.trend, 320, 120), [snapshot.trend]);
  const areaPath = `${trendPath.lineToFill} 320,120 0,120 Z`;

  function handleAthleteClick(nextIndex: number) {
    setDirection(nextIndex > athleteIndex ? 1 : -1);
    setAthleteIndex(nextIndex);
  }

  return (
    <div className="mt-8 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.44_0.05_215_/_0.58),oklch(0.39_0.05_165_/_0.46))] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Simulação visual de atletas</p>
            <p className="mt-1 text-xs text-foreground/64">Carrossel automático com transição horizontal e troca por modalidade</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground/78">demo interativa</span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {athletes.map((entry, index) => {
            const active = index === athleteIndex;

            return (
              <button
                key={entry.name}
                type="button"
                onClick={() => handleAthleteClick(index)}
                className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                  active
                    ? "bg-white/16 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                    : "bg-white/8 text-foreground/68 hover:bg-white/12 hover:text-foreground"
                }`}
              >
                {entry.name}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {sportOrder.map((sport) => {
            const active = sport === selectedSport;
            const label = athlete.sports[sport].label;

            return (
              <button
                key={sport}
                type="button"
                onClick={() => setSelectedSport(sport)}
                className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] transition ${
                  active
                    ? "border-white/18 bg-[linear-gradient(135deg,oklch(0.84_0.11_210_/_0.24),oklch(0.82_0.14_165_/_0.18))] text-foreground"
                    : "border-white/10 bg-white/6 text-foreground/68 hover:bg-white/10 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 overflow-hidden rounded-[26px] border border-white/10 bg-white/7 p-4">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={`${athlete.name}-${selectedSport}`}
              custom={direction}
              initial={{ opacity: 0, x: direction > 0 ? 44 : -44 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -44 : 44 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-4 sm:grid-cols-[0.88fr_1.12fr] sm:items-end"
            >
              <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.46_0.05_215_/_0.5),oklch(0.42_0.05_165_/_0.38))] p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-white/14 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                    {athlete.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{athlete.name}</p>
                    <p className="mt-1 text-xs text-foreground/64">{athlete.role}</p>
                    <p className="mt-1 text-xs text-foreground/54">{athlete.city}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-[20px] bg-white/8 px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/62">destaque</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/84">{athlete.accent}</p>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3 rounded-[20px] bg-white/8 p-4">
                  <TriathlonAthlete icon={selectedSport} label={snapshot.label} />
                  <div className="text-right">
                    <p className="text-xs text-foreground/58">atividade ativa</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{snapshot.label}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="ml-auto max-w-[280px] rounded-[20px] rounded-br-md bg-white px-4 py-3 text-[#111b21] shadow-[0_12px_24px_rgba(17,27,33,0.08)]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#128c7e]">WhatsApp report</p>
                  <p className="mt-1 text-sm font-semibold">{snapshot.label} · {athlete.name}</p>
                  <p className="mt-1 text-xs text-[#5f6c72]">{snapshot.summary}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <MiniStat value={snapshot.primaryMetric} label={snapshot.primaryLabel} />
                  <MiniStat value={snapshot.secondaryMetric} label={snapshot.secondaryLabel} />
                </div>

                <div className="flex flex-wrap gap-2">
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="grid gap-4">
        <PerformanceCard
          title={`Evolução semanal · ${snapshot.label}`}
          subtitle={`Carga visual de ${athlete.name}`}
          badge="7 dias"
        >
          <BarPerformanceChart values={snapshot.weekly} labels={["S", "T", "Q", "Q", "S", "S", "D"]} accent={athlete.accent} />
        </PerformanceCard>

        <PerformanceCard
          title={`Evolução mensal · ${snapshot.label}`}
          subtitle={`Tendência de consistência de ${athlete.name}`}
          badge="30 dias"
        >
          <LinePerformanceChart path={trendPath.line} areaPath={areaPath} activeIndex={activeSportIndex} />
        </PerformanceCard>
      </div>
    </div>
  );
}

function buildTrendPath(values: readonly number[], width: number, height: number) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / (max - min || 1)) * (height - 12) - 6;
    return { x, y };
  });

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const lineToFill = points.map((point) => `${point.x} ${point.y}`).join(" ");

  return { line, lineToFill };
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
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.44_0.05_215_/_0.58),oklch(0.39_0.05_165_/_0.46))] p-5">
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
  accent,
}: {
  values: readonly number[];
  labels: readonly string[];
  accent: string;
}) {
  return (
    <div>
      <div className="flex h-36 items-end gap-3">
        {values.map((value, index) => (
          <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-full w-full items-end rounded-full bg-white/6 p-1">
              <motion.div
                className="w-full rounded-full bg-[linear-gradient(180deg,oklch(0.86_0.11_210),oklch(0.82_0.15_165))]"
                initial={{ height: 0 }}
                animate={{ height: `${value}%` }}
                transition={{ duration: 0.55, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className="text-[10px] font-medium text-foreground/62">{labels[index]}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-foreground/64">{accent}</p>
    </div>
  );
}

function LinePerformanceChart({
  path,
  areaPath,
  activeIndex,
}: {
  path: string;
  areaPath: string;
  activeIndex: number;
}) {
  return (
    <div className="space-y-4">
      <svg viewBox="0 0 320 120" className="h-32 w-full overflow-visible">
        <path d="M0 112 H320" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <path d="M0 60 H320" stroke="rgba(255,255,255,0.09)" strokeWidth="1" strokeDasharray="4 6" />
        <motion.path
          d={areaPath}
          fill="url(#trend-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          transition={{ duration: 0.45 }}
        />
        <motion.path
          d={path}
          fill="none"
          stroke="rgba(173,242,255,0.95)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0.4 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(173,242,255,0.55)" />
            <stop offset="100%" stopColor="rgba(57,214,152,0)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="grid grid-cols-3 gap-2 text-[10px] font-medium text-foreground/62 sm:grid-cols-6">
        {["sem 1", "sem 2", "sem 3", "sem 4", "pico", "agora"].map((label, index) => (
          <span key={label} className={index === activeIndex ? "text-foreground" : undefined}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/8 px-3 py-3 text-center">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/62">{label}</p>
    </div>
  );
}

function TriathlonAthlete({ icon, label }: { icon: Sport; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-[linear-gradient(135deg,oklch(0.84_0.11_210_/_0.22),oklch(0.82_0.14_165_/_0.18))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
        <SportIcon icon={icon} />
      </div>
      <div>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/70">{label}</span>
        <p className="mt-1 text-sm font-semibold text-foreground">modo interativo</p>
      </div>
    </div>
  );
}

function SportIcon({ icon }: { icon: Sport }) {
  if (icon === "swim") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-white">
        <circle cx="8" cy="7" r="2" fill="currentColor" />
        <path d="M10 9.5l2.5 2 2-1.5 2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 17c1.1 0 1.6-.7 2.7-.7S7.3 17 8.4 17s1.6-.7 2.7-.7 1.6.7 2.7.7 1.6-.7 2.7-.7 1.6.7 2.7.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "bike") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-white">
        <circle cx="6.5" cy="16.5" r="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.5" cy="16.5" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 8h3l2 4h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 16.5 8 8l-2 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-white">
      <circle cx="14" cy="5.5" r="2" fill="currentColor" />
      <path d="M9 20l2.5-6 2.5 2 2 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 14l-3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 8.5l-2 3 3.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
