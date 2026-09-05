import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  resolveDeliveryMaterializer: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    messageDelivery: { findUnique: mocks.findUnique },
  },
}));

vi.mock("@/modules/shared/reports/delivery", () => ({
  resolveDeliveryMaterializer: mocks.resolveDeliveryMaterializer,
  getDeliveryDispatchHooks: () => [],
  getWhatsAppDispatchSettings: async () => ({
    whatsappDispatchPaused: false,
    maxMessagesPerRun: 1,
    delayBetweenMessagesSeconds: 0,
    maxMessagesPerHour: 1,
    maxMessagesPerDay: 1,
  }),
}));

vi.mock("@/server/providers/messaging/evolution", () => ({ evolutionProvider: {} }));
vi.mock("@/server/logging/logger", () => ({ logger: { error: vi.fn() } }));

import * as reporting from "@/server/services/reporting";

describe("delivery materialization failures", () => {
  it("returns a failure result when a report materializer throws", async () => {
    const materialize = (reporting as Record<string, unknown>).materializeDelivery;

    expect(materialize).toBeTypeOf("function");
    if (typeof materialize !== "function") {
      throw new Error("Expected materializeDelivery to be testable");
    }

    mocks.findUnique.mockResolvedValue({ id: "delivery_1", userId: "user_1", type: "POST_ACTIVITY_REPORT:activity_1" });
    mocks.resolveDeliveryMaterializer.mockReturnValue(async () => {
      throw new Error("POST_ACTIVITY_SPLITS_CACHE_MISSING");
    });

    await expect(materialize("delivery_1")).resolves.toEqual({
      ok: false,
      errorCode: "POST_ACTIVITY_SPLITS_CACHE_MISSING",
    });
  });
});
