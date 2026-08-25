const ACTIVITY_LABEL_MAP: Record<string, string> = {
  lap_swimming: "Natação em piscina",
  swimming: "Natação",
  open_water_swimming: "Natação em águas abertas",
  pool_swimming: "Natação em piscina",
  cycling: "Ciclismo",
  indoor_cycling: "Ciclismo indoor",
  road_biking: "Ciclismo de estrada",
  mountain_biking: "Mountain bike",
  gravel_cycling: "Ciclismo gravel",
  virtual_ride: "Pedalada virtual",
  biking: "Ciclismo",
  running: "Corrida",
  trail_running: "Corrida em trilha",
  treadmill_running: "Corrida na esteira",
  walking: "Caminhada",
  hiking: "Trilha",
  strength_training: "Musculação",
  cardio_training: "Cardio",
  hiit: "Treino HIIT",
  multisport: "Multiesporte",
  aquathlon: "Aquatlo",
  triathlon: "Triathlon",
  transition: "Transição",
  rowing: "Remo",
  elliptical: "Elíptico",
  yoga: "Yoga",
  pilates: "Pilates",
};

const phraseReplacements: Array<[string, string]> = [
  ["lap swimming", "natação em piscina"],
  ["open water swimming", "natação em águas abertas"],
  ["pool swimming", "natação em piscina"],
  ["maintaining anaerobic base", "mantendo base anaeróbica"],
  ["maintaining aerobic base", "mantendo base aeróbica"],
  ["improving anaerobic base", "melhorando base anaeróbica"],
  ["improving aerobic base", "melhorando base aeróbica"],
  ["anaerobic base", "base anaeróbica"],
  ["aerobic base", "base aeróbica"],
  ["anaerobic capacity", "capacidade anaeróbica"],
  ["aerobic capacity", "capacidade aeróbica"],
  ["base building", "construção de base"],
  ["race pace", "ritmo de prova"],
  ["threshold", "limiar"],
  ["recovery", "recuperação"],
  ["warm up", "aquecimento"],
  ["cool down", "desaquecimento"],
  ["training load", "carga de treino"],
];

const wordReplacements: Array<[string, string]> = [
  ["swimming", "natação"],
  ["cycling", "ciclismo"],
  ["running", "corrida"],
  ["walking", "caminhada"],
  ["strength", "força"],
  ["training", "treino"],
  ["maintaining", "mantendo"],
  ["improving", "melhorando"],
  ["improve", "melhorar"],
  ["aerobic", "aeróbica"],
  ["anaerobic", "anaeróbica"],
  ["base", "base"],
  ["lap", "volta"],
  ["split", "split"],
  ["ride", "pedalada"],
  ["run", "corrida"],
  ["walk", "caminhada"],
  ["recovery", "recuperação"],
  ["tempo", "ritmo"],
  ["steady", "constante"],
  ["sprint", "sprint"],
  ["active", "ativo"],
  ["rest", "descanso"],
  ["interval", "intervalo"],
  ["drill", "técnica"],
];

export function humanizeActivityLabel(value: string | null | undefined) {
  const normalizedKey = normalizeActivityKey(value);

  if (!normalizedKey) {
    return null;
  }

  const mapped = ACTIVITY_LABEL_MAP[normalizedKey];
  if (mapped) {
    return mapped;
  }

  return titleCase(applyTranslations(normalizedKey.replace(/_/g, " ")));
}

export function humanizeActivityText(value: string | null | undefined) {
  const normalized = normalizeActivityText(value);

  if (!normalized) {
    return null;
  }

  return sentenceCase(applyTranslations(normalized));
}

function normalizeActivityKey(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeActivityText(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  return value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function applyTranslations(value: string) {
  let next = ` ${value} `;

  for (const [search, replacement] of phraseReplacements) {
    next = next.replaceAll(` ${search} `, ` ${replacement} `);
  }

  for (const [search, replacement] of wordReplacements) {
    next = next.replaceAll(` ${search} `, ` ${replacement} `);
  }

  return next.trim().replace(/\s+/g, " ");
}

function sentenceCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function titleCase(value: string) {
  return value.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
}
