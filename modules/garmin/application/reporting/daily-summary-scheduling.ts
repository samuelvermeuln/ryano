export type DailyGarminDeliveryDecision =
  | { action: "wait" }
  | { action: "queue-summary" };

/**
 * A scheduled daily report never notifies the user about missing readings. It
 * waits for the next Garmin sync and queues the normal report once the complete
 * physiological snapshot is available.
 */
export function getDailyGarminDeliveryDecision(
  hasCompletePhysiologicalReadings: boolean,
): DailyGarminDeliveryDecision {
  return hasCompletePhysiologicalReadings
    ? { action: "queue-summary" }
    : { action: "wait" };
}
