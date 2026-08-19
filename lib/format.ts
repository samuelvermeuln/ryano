export function formatDateTime(input: Date | string | null | undefined) {
  if (!input) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(input));
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) {
    return "—";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${minutes} min`;
}

export function formatDistance(meters: number | null | undefined) {
  if (!meters && meters !== 0) {
    return "—";
  }

  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatWeight(value: number | string | null | undefined) {
  if (!value) {
    return "—";
  }

  return `${value} kg`;
}
