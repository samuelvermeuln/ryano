/**
 * Matriz de fechamento multi-provider (Task 9.4 / Req 21.1, 21.4).
 *
 * Este arquivo CONSOLIDA a matriz completa do Requisito 21.1, exercitando os
 * blocos de construção (todos já testados individualmente) em conjunto e
 * cobrindo os cenários cruzados que ainda faltavam:
 *   - falhas ISOLADAS combinadas no mesmo batch (exceção + status=failed no
 *     mesmo run, provando que o desfecho de um usuário não contamina o dos
 *     outros);
 *   - DESCONEXÃO independente (desconectar um provider mantém o outro intacto
 *     na UI de integrações);
 *   - ausência de capability NÃO quebra o dashboard/detalhe (Req 21.4).
 *
 * Onde um cenário já é coberto em outro arquivo, aqui adicionamos apenas a
 * asserção transversal (a combinação), evitando duplicar verbatim:
 *   - `tests/view-models-multi-provider.test.ts` — dashboard/base view por combo;
 *   - `tests/integration-cards.test.ts` — grupos de cards por combo de conexão;
 *   - `modules/strava/tests/sync-all-strava.test.ts` — isolamento por usuário;
 *   - `modules/strava/tests/cleanup-purge.test.ts` — limpeza escopada à conexão
 *     STRAVA (isolamento de dados na desconexão/desautorização).
 *
 * Tudo roda OFFLINE (Req 21.4): Prisma, o módulo Garmin e `syncStravaForUser`
 * são mockados; nenhuma rede é tocada.
 *
 * _Requisitos: 21.1, 21.4_
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted) -------------------------------------------------------
// Um único mock de Prisma serve às duas frentes:
//  - queries do dashboard (`getDashboardData`/`getAvailableDailyInsights`);
//  - batch de sync do Strava (`syncAllStravaUsers` → wearableConnection.findMany).
// O módulo Garmin é mockado SEM expor `getGarminActivityVisualData`, provando
// que o enriquecimento falha graciosamente e a visão base nunca quebra.
vi.mock("@/server/db", () => ({
  prisma: {
    wearableConnection: { findMany: vi.fn() },
    activity: { findMany: vi.fn(), findFirst: vi.fn() },
    whatsAppIdentity: { findUnique: vi.fn() },
  },
}));

vi.mock("@/modules/garmin", () => ({
  getGarminDailySnapshotForUser: vi.fn(),
  getLatestGarminReconnectNotification: vi.fn(),
}));

// Controla o desfecho por usuário no batch de sync sem tocar client/rede/banco.
vi.mock("@/modules/strava/application/sync/sync-strava", () => ({
  syncStravaForUser: vi.fn(),
}));

// Importar o catálogo registra o resolver de capabilities do core (essencial
// para `getUserCapabilities`/`buildIntegrationCards` e as decisões de seção).
import "@/modules/shared/integrations/catalog";
import { getUserCapabilities } from "@/modules/shared/integrations/capabilities";
import type { ProviderId } from "@/modules/shared/integrations/types";
import {
  buildIntegrationCards,
  type UserConnectionSummary,
} from "@/modules/shared/integrations/presentation";
import { buildBaseActivityVisualData } from "@/modules/shared/activities/presentation/get-activity-visual-data";

import { prisma } from "@/server/db";
import {
  getGarminDailySnapshotForUser,
  getLatestGarminReconnectNotification,
} from "@/modules/garmin";
import { getAvailableDailyInsights, getDashboardData } from "@/server/queries";
import { syncStravaForUser } from "@/modules/strava/application/sync/sync-strava";
import { syncAllStravaUsers } from "@/modules/strava/application/sync/sync-all-strava";

// --- Mock handles ----------------------------------------------------------
const connFindManyMock = vi.mocked(prisma.wearableConnection.findMany);
const activityFindManyMock = vi.mocked(prisma.activity.findMany);
const activityFindFirstMock = vi.mocked(prisma.activity.findFirst);
const whatsappFindUniqueMock = vi.mocked(prisma.whatsAppIdentity.findUnique);
const garminSnapshotMock = vi.mocked(getGarminDailySnapshotForUser);
const garminReconnectMock = vi.mocked(getLatestGarminReconnectNotification);
const syncStravaForUserMock = vi.mocked(syncStravaForUser);

const GARMIN_SNAPSHOT = { readiness: { score: 68 } } as unknown as Awaited<
  ReturnType<typeof getGarminDailySnapshotForUser>
>;

const PHYSIOLOGICAL = ["recovery", "sleep", "hrv", "readiness"] as const;

function hasAnyPhysiological(providers: ProviderId[]): boolean {
  const caps = getUserCapabilities(providers);
  return PHYSIOLOGICAL.some((cap) => caps[cap] === true);
}

// --- Fixtures --------------------------------------------------------------
type ActivityLike = Parameters<typeof buildBaseActivityVisualData>[0];

function makeActivity(overrides: Partial<ActivityLike> = {}): ActivityLike {
  const base = {
    id: "act_matrix",
    userId: "user_matrix",
    wearableConnectionId: "conn_matrix",
    externalId: "ext_1",
    provider: "STRAVA",
    sportType: "run",
    providerSportType: "Run",
    name: "Treino de matriz",
    startedAt: new Date("2026-02-01T07:00:00.000Z"),
    endedAt: null,
    durationSeconds: 2400,
    movingSeconds: null,
    distanceMeters: 7000,
    calories: 410,
    averageHeartRate: 148,
    maxHeartRate: 170,
    averagePace: 5.7,
    averageSpeed: 2.9,
    maxSpeed: 3.4,
    elevationGain: 55,
    averageCadence: 170,
    averagePower: null,
    maxPower: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-02-01T07:40:00.000Z"),
    updatedAt: new Date("2026-02-01T07:40:00.000Z"),
  } as unknown as ActivityLike;

  return { ...base, ...overrides } as ActivityLike;
}

type ConnectionRow = {
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
};

function connection(provider: string, status = "CONNECTED"): ConnectionRow {
  return { provider, status, lastSyncAt: null, lastSyncStatus: null };
}

function cards(connections: UserConnectionSummary[]) {
  return buildIntegrationCards(connections);
}

function providersOf(group: { provider: string }[]): string[] {
  return group.map((card) => card.provider).sort();
}

// ---------------------------------------------------------------------------
// Cenário 1 — SEM provider (Req 21.1: "usuário sem provider")
// Asserção transversal: capabilities vazias + cards (nada conectado, tudo
// disponível) + dashboard sem providers nem seção fisiológica, tudo coerente.
// ---------------------------------------------------------------------------
describe("Matriz 21.1 · sem provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activityFindManyMock.mockResolvedValue([] as never);
    activityFindFirstMock.mockResolvedValue(null as never);
    whatsappFindUniqueMock.mockResolvedValue(null as never);
    garminSnapshotMock.mockResolvedValue(GARMIN_SNAPSHOT);
    garminReconnectMock.mockResolvedValue(null as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("capabilities vazias, GARMIN/STRAVA disponíveis e dashboard sem fisiológico", async () => {
    // Capabilities
    expect(getUserCapabilities([])).toEqual({});
    expect(hasAnyPhysiological([])).toBe(false);

    // Cards: nada conectado; ambos disponíveis para CONNECT.
    const groups = cards([]);
    expect(groups.connected).toEqual([]);
    expect(providersOf(groups.available)).toEqual(["GARMIN", "STRAVA"]);
    for (const card of groups.available) {
      expect(card.action).toBe("CONNECT");
      expect(card.connected).toBe(false);
    }

    // Dashboard: sem providers conectados e sem snapshot fisiológico.
    connFindManyMock.mockResolvedValue([] as never);
    const data = await getDashboardData("user_matrix", 30);
    expect(data.connectedProviders).toEqual([]);
    expect(data.summary.capabilities).toEqual({});
    expect(data.summary.garminToday).toBeNull();
    expect(garminSnapshotMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cenário 2 — só GARMIN (Req 21.1: "só Garmin")
// ---------------------------------------------------------------------------
describe("Matriz 21.1 · só Garmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    garminSnapshotMock.mockResolvedValue(GARMIN_SNAPSHOT);
    garminReconnectMock.mockResolvedValue(null as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("capabilities fisiológicas presentes, Garmin gerenciável e base view do treino Garmin", async () => {
    const caps = getUserCapabilities(["GARMIN"]);
    expect(caps.recovery).toBe(true);
    expect(caps.sleep).toBe(true);
    expect(caps.hrv).toBe(true);
    expect(hasAnyPhysiological(["GARMIN"])).toBe(true);

    // Card Garmin conectado (MANAGE); Strava permanece disponível (não obrigatório).
    const groups = cards([{ provider: "GARMIN", status: "CONNECTED" }]);
    expect(providersOf(groups.connected)).toEqual(["GARMIN"]);
    expect(groups.connected[0]?.action).toBe("MANAGE");
    expect(providersOf(groups.available)).toEqual(["STRAVA"]);

    // Insights diários: snapshot fisiológico é buscado.
    connFindManyMock.mockResolvedValue([connection("GARMIN")] as never);
    const insights = await getAvailableDailyInsights("user_matrix");
    expect(insights.connectedProviders).toEqual(["GARMIN"]);
    expect(insights.capabilities.recovery).toBe(true);
    expect(insights.garminSnapshot).toBe(GARMIN_SNAPSHOT);

    // Base view de uma atividade Garmin.
    const view = buildBaseActivityVisualData(
      makeActivity({ provider: "GARMIN", sportType: "run" }),
    );
    expect(view.provider).toBe("GARMIN");
    expect(view.heroStats.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Cenário 3 — só STRAVA (Req 21.1: "só Strava"; Garmin NÃO é obrigatório)
// ---------------------------------------------------------------------------
describe("Matriz 21.1 · só Strava", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activityFindManyMock.mockResolvedValue([] as never);
    activityFindFirstMock.mockResolvedValue(null as never);
    whatsappFindUniqueMock.mockResolvedValue(null as never);
    garminSnapshotMock.mockResolvedValue(GARMIN_SNAPSHOT);
    garminReconnectMock.mockResolvedValue(null as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("capabilities de atividades/streams SEM fisiológico, Garmin disponível (não obrigatório) e base view Strava nunca nula", async () => {
    const caps = getUserCapabilities(["STRAVA"]);
    expect(caps.activities).toBe(true);
    expect(caps.streams).toBe(true);
    expect(caps.recovery).toBeUndefined();
    expect(caps.sleep).toBeUndefined();
    expect(caps.hrv).toBeUndefined();
    expect(caps.readiness).toBeUndefined();
    expect(hasAnyPhysiological(["STRAVA"])).toBe(false);

    // Strava conectado; Garmin disponível (CONNECT), jamais tratado como faltando.
    const groups = cards([{ provider: "STRAVA", status: "CONNECTED" }]);
    expect(providersOf(groups.connected)).toEqual(["STRAVA"]);
    expect(providersOf(groups.available)).toEqual(["GARMIN"]);
    expect(
      groups.available.find((c) => c.provider === "GARMIN")?.action,
    ).toBe("CONNECT");

    // Dashboard Strava-only: sem seção fisiológica, sem throw, sem fetch Garmin.
    connFindManyMock.mockResolvedValue([connection("STRAVA")] as never);
    const data = await getDashboardData("user_matrix", 30);
    expect(data.connectedProviders).toEqual(["STRAVA"]);
    expect(data.summary.capabilities.activities).toBe(true);
    expect(data.summary.capabilities.recovery).toBeUndefined();
    expect(data.summary.garminToday).toBeNull();
    expect(garminSnapshotMock).not.toHaveBeenCalled();

    // Base view de uma atividade Strava: nunca nula.
    const view = buildBaseActivityVisualData(
      makeActivity({ provider: "STRAVA", sportType: "run" }),
    );
    expect(view).not.toBeNull();
    expect(view.provider).toBe("STRAVA");
    expect(view.heroStats.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Cenário 4 — AMBOS (Req 21.1: "Garmin + Strava")
// ---------------------------------------------------------------------------
describe("Matriz 21.1 · ambos os providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activityFindManyMock.mockResolvedValue([] as never);
    activityFindFirstMock.mockResolvedValue(null as never);
    whatsappFindUniqueMock.mockResolvedValue(null as never);
    garminSnapshotMock.mockResolvedValue(GARMIN_SNAPSHOT);
    garminReconnectMock.mockResolvedValue(null as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("união de capabilities (fisiológico Garmin + streams Strava), ambos conectados e dashboard expõe os dois", async () => {
    const caps = getUserCapabilities(["GARMIN", "STRAVA"]);
    expect(caps.recovery).toBe(true); // Garmin
    expect(caps.streams).toBe(true); // Strava
    expect(caps.activities).toBe(true);
    expect(hasAnyPhysiological(["GARMIN", "STRAVA"])).toBe(true);

    // Ambos em "connected"; nada em "available".
    const groups = cards([
      { provider: "GARMIN", status: "CONNECTED" },
      { provider: "STRAVA", status: "CONNECTED" },
    ]);
    expect(providersOf(groups.connected)).toEqual(["GARMIN", "STRAVA"]);
    expect(providersOf(groups.available)).toEqual([]);

    // Dashboard expõe ambos em connectedProviders + snapshot Garmin.
    connFindManyMock.mockResolvedValue([
      connection("GARMIN"),
      connection("STRAVA"),
    ] as never);
    const data = await getDashboardData("user_matrix", 30);
    expect(data.connectedProviders.sort()).toEqual(["GARMIN", "STRAVA"]);
    expect(data.summary.capabilities.recovery).toBe(true);
    expect(data.summary.capabilities.streams).toBe(true);
    expect(data.summary.garminToday).toBe(GARMIN_SNAPSHOT);
  });
});

// ---------------------------------------------------------------------------
// Cenário 5 — FALHAS ISOLADAS (Req 21.1: "Garmin falha e Strava funciona /
// Strava falha e Garmin funciona"). GAP: combinar, no MESMO batch, uma exceção
// inesperada E um status=failed, provando que NENHUM desfecho de um usuário
// afeta o agregado dos demais. (Casos unitários separados vivem em
// modules/strava/tests/sync-all-strava.test.ts.)
// ---------------------------------------------------------------------------
describe("Matriz 21.1 · falhas isoladas (agregação cross-usuário)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => vi.clearAllMocks());

  it("exceção + status=failed no mesmo run não impedem o sucesso dos demais nem lançam", async () => {
    // Três conexões STRAVA conectadas.
    connFindManyMock.mockResolvedValue([
      { id: "c1", userId: "u1" },
      { id: "c2", userId: "u2" },
      { id: "c3", userId: "u3" },
    ] as never);

    // u1 lança exceção; u2 retorna failed; u3 sincroniza com sucesso.
    syncStravaForUserMock
      .mockRejectedValueOnce(new Error("provider indisponível"))
      .mockResolvedValueOnce({
        status: "failed",
        syncedCount: 0,
        createdCount: 0,
        errorCode: "STRAVA_API_ERROR",
      } as never)
      .mockResolvedValueOnce({
        status: "synced",
        syncedCount: 4,
        createdCount: 4,
      } as never);

    const result = await syncAllStravaUsers();

    // O batch NUNCA lança e agrega desfechos isoladamente.
    expect(result.totalConnections).toBe(3);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(2);
    // Só o usuário bem-sucedido contribui para o total de atividades.
    expect(result.syncedActivities).toBe(4);
    // Todos os três foram tentados: as falhas não abortaram o loop.
    expect(syncStravaForUserMock).toHaveBeenCalledTimes(3);

    // O usuário saudável foi sincronizado apesar das falhas dos vizinhos.
    const u3 = result.results.find((r) => r.userId === "u3");
    expect(u3?.status).toBe("synced");
    expect(u3?.syncedCount).toBe(4);
    // A exceção do u1 foi isolada e registrada como falha.
    expect(result.results.find((r) => r.userId === "u1")?.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Cenário 6 — DESCONEXÃO INDEPENDENTE (Req 21.1: "desconectar um mantém o
// outro"). Estado de UI: desconectar um provider o devolve a "available"
// (CONNECT) sem afetar o outro, que permanece MANAGE/conectado. O isolamento
// da LIMPEZA de dados (secrets/detalhes/cache/atividades escopados só à conexão
// STRAVA) é coberto em modules/strava/tests/cleanup-purge.test.ts.
// ---------------------------------------------------------------------------
describe("Matriz 21.1 · desconexão independente", () => {
  it("desconectar Strava mantém Garmin gerenciável e devolve Strava a CONNECT", () => {
    const groups = cards([
      { provider: "GARMIN", status: "CONNECTED" },
      { provider: "STRAVA", status: "DISCONNECTED" },
    ]);

    // Garmin intacto (conectado/MANAGE).
    expect(providersOf(groups.connected)).toEqual(["GARMIN"]);
    expect(groups.connected[0]?.action).toBe("MANAGE");
    // Strava desconectado volta a "available" com CONNECT.
    const strava = groups.available.find((c) => c.provider === "STRAVA");
    expect(strava?.connected).toBe(false);
    expect(strava?.action).toBe("CONNECT");
  });

  it("desconectar Garmin mantém Strava gerenciável e devolve Garmin a CONNECT (simétrico)", () => {
    const groups = cards([
      { provider: "GARMIN", status: "DISCONNECTED" },
      { provider: "STRAVA", status: "CONNECTED" },
    ]);

    expect(providersOf(groups.connected)).toEqual(["STRAVA"]);
    expect(groups.connected[0]?.action).toBe("MANAGE");
    const garmin = groups.available.find((c) => c.provider === "GARMIN");
    expect(garmin?.connected).toBe(false);
    expect(garmin?.action).toBe("CONNECT");
  });
});

// ---------------------------------------------------------------------------
// Cenário 7 — AUSÊNCIA DE CAPABILITY NÃO QUEBRA (Req 21.4 / 21.1: "provider sem
// sleep/recovery não quebra dashboard/relatório"). Usuário Strava-only não
// produz seção fisiológica e não lança; a base view entrega hero/overview
// mesmo sem capability de detalhe.
// ---------------------------------------------------------------------------
describe("Matriz 21.4 · ausência de capability não quebra", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activityFindManyMock.mockResolvedValue([] as never);
    activityFindFirstMock.mockResolvedValue(null as never);
    whatsappFindUniqueMock.mockResolvedValue(null as never);
    garminSnapshotMock.mockResolvedValue(GARMIN_SNAPSHOT);
    garminReconnectMock.mockResolvedValue(null as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("dashboard Strava-only não expõe fisiológico e não lança", async () => {
    connFindManyMock.mockResolvedValue([connection("STRAVA")] as never);

    const data = await getDashboardData("user_matrix", 30);

    // Nenhuma seção fisiológica é materializada para um provider sem ela.
    expect(data.summary.garminToday).toBeNull();
    for (const cap of PHYSIOLOGICAL) {
      expect(data.summary.capabilities[cap]).toBeUndefined();
    }
    // Ainda assim há um provider conectado e a query não quebrou.
    expect(data.connectedProviders).toEqual(["STRAVA"]);
  });

  it("base view entrega hero/overview mesmo sem capability de detalhe", () => {
    // Ciclismo Strava sem dados fisiológicos: métricas base derivam dos campos
    // normalizados, sem seções ricas.
    const view = buildBaseActivityVisualData(
      makeActivity({
        provider: "STRAVA",
        sportType: "bike",
        averagePace: null,
        averageSpeed: 8.33,
      }),
    );

    expect(view.sportKey).toBe("bike");
    expect(view.heroStats.length).toBeGreaterThan(0);
    expect(view.overviewMetrics.length).toBeGreaterThan(0);
    // Sem enriquecimento, as seções ricas ficam vazias (não quebra a renderização).
    expect(view.barSections).toEqual([]);
    expect(view.metricSections).toEqual([]);
  });
});
