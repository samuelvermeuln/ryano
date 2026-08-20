import {
  formatCadence,
  formatDistance,
  formatDuration,
  formatDurationClock,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatSwimPace,
} from "@/lib/format";
import type { PostActivityReportTemplate } from "@/lib/post-activity-report-template";
import { sportOrder, type SessionSport, type Sport } from "@/lib/sports";

type AvatarStyle = "tri" | "swim" | "run";

export type DemoWeeklySession = {
  sport: SessionSport;
  label: string;
  valueLabel: string;
  durationLabel: string;
  durationMinutes: number;
};

export type DemoWeeklyDay = {
  dayLabel: string;
  dateLabel: string;
  sessions: readonly DemoWeeklySession[];
};

export type DemoConsistencyWeek = {
  label: string;
  workouts: number;
};

export type DemoAthlete = {
  name: string;
  role: string;
  city: string;
  note: string;
  avatarStyle: AvatarStyle;
  bubbleStyle: AvatarStyle;
};

export type SportDemo = PostActivityReportTemplate & {
  sport: Sport;
  athlete: DemoAthlete;
  weeklyDays: readonly DemoWeeklyDay[];
  consistencySummary: string;
  consistencyWeeks: readonly DemoConsistencyWeek[];
  presenceStatus: string;
  reportTime: string;
  replyTime: string;
  followUpTime: string;
  userReply: string;
  assistantFollowUp: string;
};

function formatMetersValue(meters: number) {
  return new Intl.NumberFormat("pt-BR").format(meters) + " m";
}

function session(sport: SessionSport, valueLabel: string, durationMinutes: number): DemoWeeklySession {
  return {
    sport,
    label: sport === "swim" ? "Natação" : sport === "bike" ? "Ciclismo" : "Corrida",
    valueLabel,
    durationLabel: formatDuration(durationMinutes * 60),
    durationMinutes,
  };
}

export const demoSports: Record<Sport, SportDemo> = {
  swim: {
    sport: "swim",
    label: "Natação",
    athlete: {
      name: "Elisa Santos",
      role: "Nadadora master",
      city: "Belo Horizonte · MG",
      note: "Últimos 800 m 4 s/100 m mais rápidos que a primeira metade.",
      avatarStyle: "swim",
      bubbleStyle: "swim",
    },
    summary: "Ritmo médio estável, 24 voltas concluídas e leitura clara logo após sair da piscina.",
    insight: "Seu ritmo nos últimos 800 m foi 4 s/100 m mais rápido que na primeira metade.",
    metrics: [
      { label: "Distância", value: formatMetersValue(2100) },
      { label: "Tempo", value: formatDurationClock(39 * 60 + 12) },
      { label: "Ritmo médio", value: formatSwimPace(112) },
      { label: "FC média", value: formatHeartRate(142) },
    ],
    chips: ["SWOLF 36", "24 voltas", "8x100 forte"],
    weeklyTotalLabel: "2h 58min",
    weeklyComparison: "+9% em relação à semana anterior",
    weeklyDays: [
      { dayLabel: "Seg", dateLabel: "18 ago", sessions: [session("swim", formatMetersValue(1800), 34)] },
      { dayLabel: "Ter", dateLabel: "19 ago", sessions: [] },
      { dayLabel: "Qua", dateLabel: "20 ago", sessions: [session("swim", formatMetersValue(2100), 39)] },
      { dayLabel: "Qui", dateLabel: "21 ago", sessions: [session("swim", formatMetersValue(1600), 31)] },
      { dayLabel: "Sex", dateLabel: "22 ago", sessions: [] },
      { dayLabel: "Sáb", dateLabel: "23 ago", sessions: [session("swim", formatMetersValue(2200), 42)] },
      { dayLabel: "Dom", dateLabel: "24 ago", sessions: [session("swim", formatMetersValue(1700), 32)] },
    ],
    consistencySummary: "4 treinos nesta semana",
    consistencyWeeks: [
      { label: "Sem 1", workouts: 3 },
      { label: "Sem 2", workouts: 4 },
      { label: "Sem 3", workouts: 3 },
      { label: "Sem 4", workouts: 4 },
      { label: "Sem 5", workouts: 5 },
      { label: "Esta", workouts: 4 },
    ],
    presenceStatus: "última atividade às 06:42",
    reportTime: "06:42",
    replyTime: "06:43",
    followUpTime: "06:44",
    userReply: "Gostei de ver ritmo e FC logo depois da piscina.",
    assistantFollowUp: "Seu ritmo ficou mais constante nos últimos 800 m e o SWOLF manteve 36.",
  },
  bike: {
    sport: "bike",
    label: "Ciclismo",
    athlete: {
      name: "Caio Fernandes",
      role: "Ciclista de estrada",
      city: "Campinas · SP",
      note: "Últimos 20 km acima de 32 km/h com subida acumulada de 486 m.",
      avatarStyle: "tri",
      bubbleStyle: "tri",
    },
    summary: "Velocidade média sólida, elevação acumulada alta e potência estável no trecho final.",
    insight: "Nos últimos 20 km você sustentou velocidade acima de 32 km/h.",
    metrics: [
      { label: "Distância", value: formatDistance(58400) },
      { label: "Tempo", value: formatDurationClock(1 * 3600 + 52 * 60 + 18) },
      { label: "Velocidade média", value: formatSpeed(31.2) },
      { label: "FC média", value: formatHeartRate(147) },
    ],
    chips: [formatPower(228), formatCadence(89), `Elevação ${formatElevation(486)}`],
    weeklyTotalLabel: "6h 11min",
    weeklyComparison: "+12% em relação à semana anterior",
    weeklyDays: [
      { dayLabel: "Seg", dateLabel: "18 ago", sessions: [] },
      { dayLabel: "Ter", dateLabel: "19 ago", sessions: [session("bike", formatDistance(32100), 64)] },
      { dayLabel: "Qua", dateLabel: "20 ago", sessions: [] },
      { dayLabel: "Qui", dateLabel: "21 ago", sessions: [session("bike", formatDistance(58400), 112)] },
      { dayLabel: "Sex", dateLabel: "22 ago", sessions: [] },
      { dayLabel: "Sáb", dateLabel: "23 ago", sessions: [session("bike", formatDistance(76200), 146)] },
      { dayLabel: "Dom", dateLabel: "24 ago", sessions: [session("bike", formatDistance(20100), 49)] },
    ],
    consistencySummary: "4 pedais nesta semana",
    consistencyWeeks: [
      { label: "Sem 1", workouts: 2 },
      { label: "Sem 2", workouts: 3 },
      { label: "Sem 3", workouts: 4 },
      { label: "Sem 4", workouts: 3 },
      { label: "Sem 5", workouts: 4 },
      { label: "Esta", workouts: 4 },
    ],
    presenceStatus: "último pedal às 08:14",
    reportTime: "08:14",
    replyTime: "08:15",
    followUpTime: "08:16",
    userReply: "Velocidade e elevação juntas ajudam muito no pós-pedal.",
    assistantFollowUp: "Potência média de 228 W, cadência de 89 rpm e subida acumulada de 486 m.",
  },
  run: {
    sport: "run",
    label: "Corrida",
    athlete: {
      name: "Rosa Maria",
      role: "Corredora de rua",
      city: "Curitiba · PR",
      note: "Os últimos 2 km saíram 11 s/km mais rápidos que o bloco inicial.",
      avatarStyle: "run",
      bubbleStyle: "run",
    },
    summary: "Ritmo médio estável, frequência cardíaca controlada e cadência consistente no fim do treino.",
    insight: "Seus últimos 2 km foram 11 s/km mais rápidos que o início do treino.",
    metrics: [
      { label: "Distância", value: formatDistance(8400) },
      { label: "Tempo", value: formatDurationClock(44 * 60 + 31) },
      { label: "Ritmo médio", value: formatPace(318) },
      { label: "FC média", value: formatHeartRate(151) },
    ],
    chips: [formatCadence(168), `FC máx ${formatHeartRate(172)}`, `Elevação ${formatElevation(124)}`],
    weeklyTotalLabel: "3h 28min",
    weeklyComparison: "+6% em relação à semana anterior",
    weeklyDays: [
      { dayLabel: "Seg", dateLabel: "18 ago", sessions: [session("run", formatDistance(6200), 35)] },
      { dayLabel: "Ter", dateLabel: "19 ago", sessions: [] },
      { dayLabel: "Qua", dateLabel: "20 ago", sessions: [session("run", formatDistance(8400), 45)] },
      { dayLabel: "Qui", dateLabel: "21 ago", sessions: [session("run", formatDistance(5100), 28)] },
      { dayLabel: "Sex", dateLabel: "22 ago", sessions: [] },
      { dayLabel: "Sáb", dateLabel: "23 ago", sessions: [session("run", formatDistance(12400), 68)] },
      { dayLabel: "Dom", dateLabel: "24 ago", sessions: [session("run", formatDistance(5900), 32)] },
    ],
    consistencySummary: "5 corridas nesta semana",
    consistencyWeeks: [
      { label: "Sem 1", workouts: 4 },
      { label: "Sem 2", workouts: 5 },
      { label: "Sem 3", workouts: 4 },
      { label: "Sem 4", workouts: 5 },
      { label: "Sem 5", workouts: 4 },
      { label: "Esta", workouts: 5 },
    ],
    presenceStatus: "última corrida às 06:57",
    reportTime: "06:57",
    replyTime: "06:58",
    followUpTime: "06:59",
    userReply: "Fica muito mais fácil comparar ritmo, FC e cadência.",
    assistantFollowUp: "Ritmo médio de 5:18 /km, FC média de 151 bpm e cadência de 168 rpm.",
  },
  triathlon: {
    sport: "triathlon",
    label: "Triathlon",
    athlete: {
      name: "Ryvano Souza",
      role: "Triatleta amador",
      city: "São Paulo · SP",
      note: "Swim, bike e run aparecem juntos com transições e tempo total em uma leitura só.",
      avatarStyle: "tri",
      bubbleStyle: "tri",
    },
    summary: "Visão única do treino multisport com splits principais, transições e volume semanal por modalidade.",
    insight: "Seu treino reúne swim, bike e run em uma única leitura com tempo total e transições.",
    metrics: [
      { label: "Tempo total", value: formatDurationClock(2 * 3600 + 18 * 60 + 40) },
      { label: "Swim", value: formatDurationClock(22 * 60 + 18) },
      { label: "Ciclismo", value: formatDurationClock(68 * 60 + 42) },
      { label: "Run", value: formatDurationClock(43 * 60 + 11) },
    ],
    chips: ["T1 01:46", "T2 02:43", formatHeartRate(149)],
    weeklyTotalLabel: "8h 16min",
    weeklyComparison: "+15% em relação à semana anterior",
    weeklyDays: [
      { dayLabel: "Seg", dateLabel: "18 ago", sessions: [session("swim", formatMetersValue(1900), 36)] },
      { dayLabel: "Ter", dateLabel: "19 ago", sessions: [session("bike", formatDistance(48200), 94)] },
      { dayLabel: "Qua", dateLabel: "20 ago", sessions: [session("run", formatDistance(9100), 48)] },
      { dayLabel: "Qui", dateLabel: "21 ago", sessions: [session("swim", formatMetersValue(2100), 39), session("run", formatDistance(5200), 29)] },
      { dayLabel: "Sex", dateLabel: "22 ago", sessions: [] },
      { dayLabel: "Sáb", dateLabel: "23 ago", sessions: [session("bike", formatDistance(68400), 132), session("run", formatDistance(7600), 41)] },
      { dayLabel: "Dom", dateLabel: "24 ago", sessions: [session("swim", formatMetersValue(1500), 29), session("bike", formatDistance(22100), 48)] },
    ],
    consistencySummary: "6 treinos nesta semana",
    consistencyWeeks: [
      { label: "Sem 1", workouts: 4 },
      { label: "Sem 2", workouts: 5 },
      { label: "Sem 3", workouts: 6 },
      { label: "Sem 4", workouts: 5 },
      { label: "Sem 5", workouts: 6 },
      { label: "Esta", workouts: 6 },
    ],
    presenceStatus: "último triathlon às 07:13",
    reportTime: "07:13",
    replyTime: "07:14",
    followUpTime: "07:15",
    userReply: "Gostei de ver splits e transições no mesmo resumo.",
    assistantFollowUp: "Tempo total de 2:18:40 com T1 de 1:46, T2 de 2:43 e visão conjunta das três modalidades.",
  },
};

export const demoSportOrder = sportOrder;
