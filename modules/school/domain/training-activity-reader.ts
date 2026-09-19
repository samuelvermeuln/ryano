/**
 * T161 — Provider-agnostic port for reading athlete activities.
 *
 * The school module uses this interface to fetch recent activities without
 * taking a direct dependency on any provider (Garmin, Strava, …).
 * Each provider module registers a concrete adapter that implements this port.
 *
 * The contract mirrors the relevant subset of `NormalizedActivity` — only
 * the fields needed for workout matching are exposed here.
 */

export interface ActivitySummary {
  /** Provider that recorded the activity. */
  source: string;
  /** Activity identifier in the provider's system. */
  externalId: string;
  /** Canonical sport type (RyvanoSportType string value). */
  sportType: string;
  /** Provider's raw sport type, preserved for re-mapping. */
  providerSportType: string;
  /** Activity start time (UTC). */
  startedAt: Date;
  /** Total duration in seconds. */
  durationSeconds?: number;
  /** Moving/active duration in seconds. */
  movingSeconds?: number;
  /** Distance in meters. */
  distanceMeters?: number;
  /** Average heart rate (bpm). */
  averageHeartRate?: number;
  /** Maximum heart rate (bpm). */
  maxHeartRate?: number;
  /** Average speed (m/s). */
  averageSpeed?: number;
  /** Elevation gain (meters). */
  elevationGain?: number;
  /** Average power (watts). */
  averagePower?: number;
  /** Raw provider payload, kept for audit and re-scoring. */
  raw?: Record<string, unknown>;
}

/**
 * Port that the school module uses to retrieve an athlete's recent activities
 * from any connected provider.
 *
 * Implementations live in `modules/<provider>/adapters/training-activity-reader.ts`
 * and are composed at the application boundary — the school module never
 * imports provider packages directly.
 */
export interface TrainingActivityReader {
  /**
   * Returns activities recorded by the given athlete between `from` and `to`.
   * Results are provider-scoped: activities from disconnected providers are
   * simply absent (the method never returns a hard error for an unconnected
   * provider — it returns an empty list for that source).
   */
  listForAthlete(params: {
    athleteUserId: string;
    from: Date;
    to: Date;
  }): Promise<ActivitySummary[]>;

  /**
   * Fetches a single activity by its provider and external identifier.
   * Returns `null` when the activity cannot be found.
   */
  getByExternalId(params: {
    athleteUserId: string;
    source: string;
    externalId: string;
  }): Promise<ActivitySummary | null>;
}
