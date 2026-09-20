/**
 * Contrato provider-agnostic para envio de treinos planejados/estruturados
 * ao dispositivo do atleta.
 *
 * Cada provider (Garmin, Polar, Wahoo…) implementa esta interface no seu
 * próprio módulo. O core invoca o provider certo via registry, sem
 * depender de identidade do provider.
 *
 * Convenções:
 * - `accountApiKey` é o segredo do provider (recuperado via secret-vault).
 * - `externalWorkoutId` é o ID opaco que o provider retorna e que
 *   armazenamos em `WorkoutAssignment.garminWorkoutId` (ou equivalente).
 * - O core nunca chama o provider diretamente; usa o registry.
 */

export type PlannedWorkoutStep = {
  /** Tipo do passo no vocabulário Ryvano → provider mapeia para o seu próprio enum. */
  stepType: "WARMUP" | "INTERVAL" | "STEADY" | "RECOVERY" | "COOLDOWN" | "DRILL" | "FREE" | "CUSTOM";
  /** Título opcional legível para o atleta. */
  title?: string | null;
  /** Duração em segundos (null = baseado em distância). */
  durationSeconds?: number | null;
  /** Distância em metros (null = baseado em duração). */
  distanceMeters?: number | null;
  /** Número de repetições (para blocos de intervalo). */
  repetitions?: number | null;
  /** Alvos opcionais para o passo. */
  target?: {
    heartRateMin?: number | null;
    heartRateMax?: number | null;
    power?: number | null;
    /** Pace alvo em s/km. */
    paceSecPerKm?: number | null;
    /** Pace nado em s/100m. */
    paceSec100m?: number | null;
    /** Zona de treino genérica (1–7). */
    zone?: number | null;
  } | null;
  /** Configuração do descanso após o passo (para intervalos). */
  rest?: {
    durationSeconds?: number | null;
    heartRateMin?: number | null;
    heartRateMax?: number | null;
  } | null;
};

export type PlannedWorkoutInput = {
  /** Credencial do provider para a conta do atleta. */
  accountApiKey: string;
  /** Título do treino (≤ 50 chars por segurança cross-provider). */
  title: string;
  /** Tipo de esporte no vocabulário Ryvano (o provider mapeia internamente). */
  sportType: string;
  /** Data planejada do treino (UTC). */
  scheduledAt: Date;
  /** Passos estruturados do treino em ordem. */
  steps: PlannedWorkoutStep[];
  /** ID interno do WorkoutAssignment (para correlação em logs). */
  workoutAssignmentId: string;
};

export type PlannedWorkoutPushResult = {
  /** ID externo no sistema do provider (ex.: Garmin workout ID). */
  externalWorkoutId: string;
  /** Informação adicional retornada pelo provider (opcional). */
  providerMeta?: Record<string, unknown>;
};

export interface PlannedWorkoutProvider {
  /**
   * Envia um treino estruturado ao dispositivo/conta do atleta.
   * Deve ser idempotente: se o treino já foi enviado, retorna o mesmo externalWorkoutId.
   */
  pushWorkout(input: PlannedWorkoutInput): Promise<PlannedWorkoutPushResult>;

  /**
   * Remove um treino planejado previamente enviado.
   * Silencia 404 (treino já removido).
   */
  deleteWorkout(input: { accountApiKey: string; externalWorkoutId: string }): Promise<void>;
}
