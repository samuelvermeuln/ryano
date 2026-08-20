export type Sport = "swim" | "bike" | "run" | "triathlon";
export type SportIconName = Sport | "multisport" | "walking" | "strength" | "default";
export type SessionSport = Extract<Sport, "swim" | "bike" | "run">;

export const sportOrder: readonly Sport[] = ["swim", "bike", "run", "triathlon"];
export const sessionSportOrder: readonly SessionSport[] = ["swim", "bike", "run"];

export const sportConfig: Record<
  SportIconName,
  {
    label: string;
    icon: string;
    lightColor: string;
    darkColor: string;
  }
> = {
  swim: {
    label: "Natação",
    icon: "mdi:swim",
    lightColor: "var(--sport-swimming-light)",
    darkColor: "var(--sport-swimming-dark)",
  },
  bike: {
    label: "Ciclismo",
    icon: "mdi:bike-fast",
    lightColor: "var(--sport-cycling-light)",
    darkColor: "var(--sport-cycling-dark)",
  },
  run: {
    label: "Corrida",
    icon: "mdi:run-fast",
    lightColor: "var(--sport-running-light)",
    darkColor: "var(--sport-running-dark)",
  },
  triathlon: {
    label: "Triathlon",
    icon: "mdi:medal-outline",
    lightColor: "var(--sport-triathlon-light)",
    darkColor: "var(--sport-triathlon-dark)",
  },
  multisport: {
    label: "Multisport",
    icon: "mdi:medal-outline",
    lightColor: "var(--sport-multisport-light)",
    darkColor: "var(--sport-multisport-dark)",
  },
  walking: {
    label: "Caminhada",
    icon: "mdi:walk",
    lightColor: "var(--sport-walking-light)",
    darkColor: "var(--sport-walking-dark)",
  },
  strength: {
    label: "Força",
    icon: "mdi:dumbbell",
    lightColor: "var(--sport-strength-light)",
    darkColor: "var(--sport-strength-dark)",
  },
  default: {
    label: "Atividade",
    icon: "mdi:heart-pulse",
    lightColor: "var(--sport-default-light)",
    darkColor: "var(--sport-default-dark)",
  },
};

export function getSportLabel(sport: SportIconName) {
  return sportConfig[sport].label;
}

export function getSportColors(sport: SportIconName) {
  return {
    light: sportConfig[sport].lightColor,
    dark: sportConfig[sport].darkColor,
  };
}
