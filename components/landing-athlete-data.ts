export type Sport = "swim" | "bike" | "run";

export type SportSnapshot = {
  label: string;
  summary: string;
  primaryMetric: string;
  primaryLabel: string;
  secondaryMetric: string;
  secondaryLabel: string;
  weekly: readonly number[];
  trend: readonly number[];
  chips: readonly string[];
  presenceStatus: string;
  reportTime: string;
  replyTime: string;
  followUpTime: string;
  userReply: string;
  assistantFollowUp: string;
};

export type Athlete = {
  name: string;
  role: string;
  city: string;
  accent: string;
  defaultSport: Sport;
  sports: Partial<Record<Sport, SportSnapshot>>;
};

export const sportOrder: readonly Sport[] = ["swim", "bike", "run"];

export const athletes: readonly Athlete[] = [
  {
    name: "Ryvano Souza",
    role: "Triatleta de rotina",
    city: "São Paulo · SP",
    accent: "volume equilibrado, visão semanal clara e leitura rápida no pós-treino",
    defaultSport: "run",
    sports: {
      swim: {
        label: "Natação",
        summary: "Bloco de técnica com ritmo firme e consistência boa na água.",
        primaryMetric: "2,4 km",
        primaryLabel: "distância",
        secondaryMetric: "1:48/100m",
        secondaryLabel: "pace médio",
        weekly: [34, 42, 40, 58, 50, 64, 56],
        trend: [24, 28, 31, 34, 38, 41, 45, 48, 51, 54, 58, 61],
        chips: ["técnica", "cadência", "consistência"],
        presenceStatus: "nadando melhor esta semana",
        reportTime: "07:09",
        replyTime: "07:10",
        followUpTime: "07:11",
        userReply: "Agora eu vejo a sessão de água sem abrir mil telas.",
        assistantFollowUp: "Distância, pace e consistência chegaram organizados para leitura rápida.",
      },
      bike: {
        label: "Bike",
        summary: "Sessão longa com ganho claro de resistência e volume bem distribuído.",
        primaryMetric: "58 km",
        primaryLabel: "distância",
        secondaryMetric: "31,2 km/h",
        secondaryLabel: "velocidade",
        weekly: [48, 66, 54, 86, 72, 92, 68],
        trend: [32, 36, 40, 44, 47, 51, 55, 58, 62, 66, 70, 75],
        chips: ["resistência", "potência", "longão"],
        presenceStatus: "pedal forte hoje",
        reportTime: "08:14",
        replyTime: "08:15",
        followUpTime: "08:16",
        userReply: "Ficou muito mais fácil entender o pedal.",
        assistantFollowUp: "Volume, velocidade e tendência semanal aparecem de forma limpa e visual.",
      },
      run: {
        label: "Corrida",
        summary: "Treino leve para forte com ritmo limpo e recuperação controlada.",
        primaryMetric: "12,1 km",
        primaryLabel: "distância",
        secondaryMetric: "4:48/km",
        secondaryLabel: "pace médio",
        weekly: [44, 60, 52, 82, 66, 78, 58],
        trend: [28, 32, 36, 40, 44, 47, 50, 54, 58, 63, 68, 72],
        chips: ["ritmo", "constância", "pós-treino"],
        presenceStatus: "corrida entregue",
        reportTime: "07:13",
        replyTime: "07:14",
        followUpTime: "07:15",
        userReply: "Agora eu entendo meu treino em segundos.",
        assistantFollowUp: "Distância, pace, duração e contexto chegam como conversa, não como relatório quebrado.",
      },
    },
  },
  {
    name: "Elisa Santos",
    role: "Nadadora master",
    city: "Belo Horizonte · MG",
    accent: "uma atleta de modalidade única com leitura visual mais calma e objetiva",
    defaultSport: "swim",
    sports: {
      swim: {
        label: "Natação",
        summary: "Série progressiva com técnica sustentada e respiração mais estável.",
        primaryMetric: "2,1 km",
        primaryLabel: "distância",
        secondaryMetric: "1:52/100m",
        secondaryLabel: "pace médio",
        weekly: [30, 38, 36, 52, 46, 60, 50],
        trend: [20, 23, 27, 31, 35, 38, 42, 45, 49, 53, 57, 60],
        chips: ["base", "controle", "fluidez"],
        presenceStatus: "técnica em destaque",
        reportTime: "06:42",
        replyTime: "06:43",
        followUpTime: "06:44",
        userReply: "Consigo revisar a água sem me perder nos números.",
        assistantFollowUp: "Pace médio, distância e constância ficaram claros logo após sair da piscina.",
      },
    },
  },
  {
    name: "Rosa Maria",
    role: "Corredora de rua",
    city: "Curitiba · PR",
    accent: "uma atleta de corrida com leitura simples, hábito forte e evolução aparente",
    defaultSport: "run",
    sports: {
      run: {
        label: "Corrida",
        summary: "Corrida contínua com boa sensação de controle e evolução semanal clara.",
        primaryMetric: "8,4 km",
        primaryLabel: "distância",
        secondaryMetric: "5:18/km",
        secondaryLabel: "pace médio",
        weekly: [34, 44, 40, 60, 54, 70, 52],
        trend: [18, 21, 25, 29, 33, 37, 41, 45, 49, 53, 58, 63],
        chips: ["base", "rotina", "hábito"],
        presenceStatus: "rodagem concluída",
        reportTime: "05:57",
        replyTime: "05:58",
        followUpTime: "05:59",
        userReply: "Ficou muito mais gostoso acompanhar minha corrida.",
        assistantFollowUp: "A leitura visual mostra distância, pace e evolução da semana sem cansar.",
      },
    },
  },
];
