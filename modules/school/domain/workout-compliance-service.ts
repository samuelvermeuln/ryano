/**
 * T205 — WorkoutComplianceService
 *
 * Selects the appropriate ComplianceStrategy by sport type and runs it.
 * The mapping from sport string to strategy is the only place that knows
 * about strategy implementations — callers only interact with the service.
 */
import type { WorkoutSnapshot } from "./workout";
import type { WorkoutExecution } from "./workout-execution";
import type { ComplianceResult, ComplianceStrategy } from "./compliance-strategy";
import {
  DefaultComplianceStrategy,
  RunComplianceStrategy,
  SwimComplianceStrategy,
  BikeComplianceStrategy,
} from "./compliance-strategy";

const STRATEGY_MAP: Record<string, ComplianceStrategy> = {
  run:         RunComplianceStrategy,
  "trail-run": RunComplianceStrategy,
  swim:        SwimComplianceStrategy,
  "open-water": SwimComplianceStrategy,
  bike:        BikeComplianceStrategy,
  mtb:         BikeComplianceStrategy,
};

/** Resolves a sport type string to its strategy, falling back to Default. */
export function resolveComplianceStrategy(sportType: string): ComplianceStrategy {
  return STRATEGY_MAP[sportType] ?? DefaultComplianceStrategy;
}

/** Calculates compliance for an execution against its prescribed snapshot. */
export function calculateCompliance(snapshot: WorkoutSnapshot, execution: WorkoutExecution): ComplianceResult {
  const strategy = resolveComplianceStrategy(execution.sportType);
  return strategy.calculate(snapshot, execution);
}
