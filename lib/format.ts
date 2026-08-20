function formatNumber(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

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
  if (seconds === null || seconds === undefined) {
    return "—";
  }

  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  }

  if (minutes > 0) {
    return remainingSeconds > 0 ? `${minutes}min ${remainingSeconds}s` : `${minutes} min`;
  }

  return `${remainingSeconds}s`;
}

export function formatDurationClock(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) {
    return "—";
  }

  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatDistance(meters: number | null | undefined) {
  if (meters === null || meters === undefined) {
    return "—";
  }

  if (Math.abs(meters) < 1000) {
    return `${formatNumber(meters, 0)} m`;
  }

  return `${formatNumber(meters / 1000, 1)} km`;
}

export function formatPace(secondsPerKm: number | null | undefined) {
  if (secondsPerKm === null || secondsPerKm === undefined) {
    return "—";
  }

  const totalSeconds = Math.max(0, Math.round(secondsPerKm));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

export function formatSwimPace(secondsPer100m: number | null | undefined) {
  if (secondsPer100m === null || secondsPer100m === undefined) {
    return "—";
  }

  const totalSeconds = Math.max(0, Math.round(secondsPer100m));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")} /100 m`;
}

export function formatSpeed(kmh: number | null | undefined) {
  if (kmh === null || kmh === undefined) {
    return "—";
  }

  return `${formatNumber(kmh, 1)} km/h`;
}

export function formatHeartRate(bpm: number | null | undefined) {
  if (bpm === null || bpm === undefined) {
    return "—";
  }

  return `${formatNumber(bpm, 0)} bpm`;
}

export function formatElevation(meters: number | null | undefined) {
  if (meters === null || meters === undefined) {
    return "—";
  }

  return `${formatNumber(meters, 0)} m`;
}

export function formatCalories(kcal: number | null | undefined) {
  if (kcal === null || kcal === undefined) {
    return "—";
  }

  return `${formatNumber(kcal, 0)} kcal`;
}

export function formatCadence(rpm: number | null | undefined) {
  if (rpm === null || rpm === undefined) {
    return "—";
  }

  return `${formatNumber(rpm, 0)} rpm`;
}

export function formatPower(watts: number | null | undefined) {
  if (watts === null || watts === undefined) {
    return "—";
  }

  return `${formatNumber(watts, 0)} W`;
}

export function formatWeight(value: number | string | null | undefined) {
  if (!value && value !== 0) {
    return "—";
  }

  return `${value} kg`;
}
