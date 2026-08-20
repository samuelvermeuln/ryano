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
};

export type Athlete = {
  name: string;
  role: string;
  city: string;
  accent: string;
  sports: Record<Sport, SportSnapshot>;
};

export const sportOrder: readonly Sport[] = ["swim", "bike", "run"];

export const athletes: readonly Athlete[] = [
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
