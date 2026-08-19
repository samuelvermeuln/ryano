import type { Activity, User, UserProfile } from "@prisma/client";

export function buildPostActivityReport(input: {
  user: Pick<User, "name"> & { profile: Pick<UserProfile, "phoneE164"> | null };
  activity: Pick<Activity, "sportType" | "name" | "durationSeconds" | "distanceMeters" | "averageHeartRate">;
}) {
  const durationMinutes = input.activity.durationSeconds
    ? Math.round(input.activity.durationSeconds / 60)
    : null;
  const distanceKm = input.activity.distanceMeters
    ? (input.activity.distanceMeters / 1000).toFixed(2)
    : null;

  return [
    `Olá, ${input.user.name ?? "atleta"}.`,
    `Nova atividade registrada${input.activity.name ? `: ${input.activity.name}` : ""}.`,
    `Modalidade: ${input.activity.sportType}.`,
    durationMinutes ? `Duração: ${durationMinutes} min.` : null,
    distanceKm ? `Distância: ${distanceKm} km.` : null,
    input.activity.averageHeartRate ? `FC média: ${input.activity.averageHeartRate} bpm.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
