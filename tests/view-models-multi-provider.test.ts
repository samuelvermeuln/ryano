import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted) -------------------------------------------------------
// Prisma é mockado para exercitar `getAvailableDailyInsights`/`getDashboardData`
// de forma determinística e offline. O módulo Garmin também é mockado, aqui
// EXPONDO `getGarminActivityVisualData`: é exatamente esse export que a entrada
// `GARMIN` do `activity-detail-enrichment-registry` carrega, então mocká-lo
// permite provar de ponta a ponta que uma atividade Garmin continua chegando ao
// enriquecedor do módulo e que o resultado dele é devolvido sem alteração
// (Requisito 1.5), além dos desfechos de omissão graciosa (dado ausente/erro).
//
// O cenário "export ausente no módulo do provider" (loader resolve `undefined`)
// continua coberto em `tests/multi-provider-matrix.test.ts`, cujo mock do módulo
// Garmin permanece sem esse export.
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
  getGarminActivityVisualData: vi.fn(),
}));

// Importar o catálogo registra o resolver de capabilities do core, essencial
// para `getUserCapabilities`/`hasCapability` e para as decisões de seção.
import "@/modules/shared/integrations/catalog";
import { getUserCapabilities } from "@/modules/shared/integrations/capabilities";
import type { ProviderId } from "@/modules/shared/integrations/types";
import {
  buildBaseActivityVisualData,
  getActivityVisualData,
} from "@/modules/shared/activities/presentation/get-activity-visual-data";

import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";

import { prisma } from "@/server/db";
import {
  getGarminActivityVisualData,
  getGarminDailySnapshotForUser,
  getLatestGarminReconnectNotification,
} from "@/modules/garmin";
import { getAvailableDailyInsights, getDashboardData } from "@/server/queries";

// --- Fixtures --------------------------------------------------------------
// Objeto no formato Prisma `Activity` (sem dado pessoal real). Só os campos
// lidos pelo builder base importam; os demais ficam em valores neutros.
type ActivityLike = Parameters<typeof buildBaseActivityVisualData>[0];

function makeActivity(overrides: Partial<ActivityLike> = {}): ActivityLike {
  const base = {
    id: "act_test",
    userId: "user_test",
    wearableConnectionId: "conn_test",
    externalId: "ext_1",
    provider: "STRAVA",
    sportType: "run",
    providerSportType: "Run",
    name: "Treino de teste",
    startedAt: new Date("2026-01-10T10:00:00.000Z"),
    endedAt: null,
    durationSeconds: 1800,
    movingSeconds: null,
    distanceMeters: 5000,
    calories: 320,
    averageHeartRate: 150,
    maxHeartRate: 172,
    averagePace: 5.5,
    averageSpeed: 2.78,
    maxSpeed: 3.2,
    elevationGain: 42,
    averageCadence: 168,
    averagePower: null,
    maxPower: null,
    timezone: null,
    metrics: null,
    rawPayload: null,
    createdAt: new Date("2026-01-10T10:30:00.000Z"),
    updatedAt: new Date("2026-01-10T10:30:00.000Z"),
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

const findManyMock = vi.mocked(prisma.wearableConnection.findMany);
const activityFindManyMock = vi.mocked(prisma.activity.findMany);
const activityFindFirstMock = vi.mocked(prisma.activity.findFirst);
const whatsappFindUniqueMock = vi.mocked(prisma.whatsAppIdentity.findUnique);
const garminSnapshotMock = vi.mocked(getGarminDailySnapshotForUser);
const garminReconnectMock = vi.mocked(getLatestGarminReconnectNotification);
const garminVisualDataMock = vi.mocked(getGarminActivityVisualData);

// Visão rica "como o Garmin monta": seções que a visão base NUNCA produz
// (`barSections`/`metricSections` preenchidas), servindo para provar que o
// dispatcher devolve o objeto do enriquecedor sem remontar nem mesclar nada.
const GARMIN_ENRICHED_VIEW: ActivityVisualData = {
  sportLabel: "Corrida",
  sportKey: "running",
  provider: "GARMIN",
  startedAtLabel: "10/01/2026 07:00",
  heroStats: [{ label: "Duração", value: "30min", tone: "text-cyan-200" }],
  overviewMetrics: [{ label: "Início", value: "10/01/2026 07:00" }],
  barSections: [
    {
      id: "heart-rate-zones",
      title: "Zonas de frequência cardíaca",
      description: "Tempo real em cada zona cardíaca retornado pela Garmin.",
      items: [
        { label: "Zona 1", valueText: "5min", ratio: 0.2, color: "#38bdf8" },
      ],
    },
  ],
  metricSections: [
    {
      id: "weather",
      title: "Clima",
      description: "Condições registradas pelo dispositivo.",
      metrics: [{ label: "Temperatura", value: "21 °C" }],
    },
  ],
};

const GARMIN_SNAPSHOT = { readiness: { score: 72 } } as unknown as Awaited<
  ReturnType<typeof getGarminDailySnapshotForUser>
>;

// ---------------------------------------------------------------------------
// 1. View base provider-agnostic (Req 7.7): nunca retorna null / nunca quebra.
// ---------------------------------------------------------------------------
describe("buildBaseActivityVisualData / getActivityVisualData (provider-agnostic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Padrão neutro: enriquecedor sem dado rico. Cada teste que exercita o
    // caminho enriquecido define o seu próprio desfecho.
    garminVisualDataMock.mockResolvedValue(null);
  });

  it("builds a non-null base view for a NON-Garmin (Strava) activity", () => {
    const activity = makeActivity({ provider: "STRAVA", sportType: "run" });
    const view = buildBaseActivityVisualData(activity);

    expect(view).not.toBeNull();
    expect(view.provider).toBe("STRAVA");
    expect(view.sportKey).toBe("run");
    // Rótulo canônico do RyvanoSportType "run".
    expect(view.sportLabel.length).toBeGreaterThan(0);
    // Métricas base derivadas dos campos normalizados.
    expect(view.heroStats.length).toBeGreaterThan(0);
    expect(view.overviewMetrics.length).toBeGreaterThan(0);
    // Seções ricas ficam vazias na visão base (sem enriquecimento).
    expect(view.barSections).toEqual([]);
    expect(view.metricSections).toEqual([]);
  });

  it("getActivityVisualData never returns null for a Strava activity (no module registered)", async () => {
    const activity = makeActivity({ provider: "STRAVA", sportType: "run" });
    const view = await getActivityVisualData(activity);

    expect(view).not.toBeNull();
    expect(view.provider).toBe("STRAVA");
    expect(view.heroStats.length).toBeGreaterThan(0);
    // O caminho de enriquecimento Garmin não é acionado para Strava.
    expect(garminSnapshotMock).not.toHaveBeenCalled();
    expect(garminVisualDataMock).not.toHaveBeenCalled();
  });

  // --- Não-regressão Garmin (Req 1.5) --------------------------------------
  // O dispatcher passou a resolver o enriquecedor pelo
  // `activity-detail-enrichment-registry` (capability + lookup), em vez do
  // antigo `if (providerId === "GARMIN")`. Os testes abaixo fixam o
  // comportamento observável do Garmin nesse novo caminho: o mesmo export do
  // módulo continua sendo chamado com a mesma atividade e o resultado dele
  // continua sendo devolvido sem alteração; qualquer outro desfecho
  // (sem dado ou erro) cai exatamente na visão base.
  it("routes a GARMIN activity through the registry to getGarminActivityVisualData and returns its result untouched", async () => {
    garminVisualDataMock.mockResolvedValue(GARMIN_ENRICHED_VIEW);

    const activity = makeActivity({ provider: "GARMIN", sportType: "run" });
    const view = await getActivityVisualData(activity);

    // O enriquecedor do módulo Garmin é chamado uma vez, com a atividade crua.
    expect(garminVisualDataMock).toHaveBeenCalledTimes(1);
    expect(garminVisualDataMock).toHaveBeenCalledWith(activity);

    // Resultado devolvido é o MESMO objeto: o dispatcher não remonta, não
    // mescla com a visão base e não descarta as seções ricas.
    expect(view).toBe(GARMIN_ENRICHED_VIEW);
    expect(view.barSections).toHaveLength(1);
    expect(view.metricSections).toHaveLength(1);
    expect(view.sportKey).toBe("running");
  });

  it("falls back to the base view when the Garmin enricher has no rich data (null)", async () => {
    garminVisualDataMock.mockResolvedValue(null);

    const activity = makeActivity({ provider: "GARMIN", sportType: "run" });
    const view = await getActivityVisualData(activity);

    expect(garminVisualDataMock).toHaveBeenCalledTimes(1);
    expect(view).toEqual(buildBaseActivityVisualData(activity));
    expect(view.provider).toBe("GARMIN");
    expect(view.sportKey).toBe("run");
    expect(view.overviewMetrics.length).toBeGreaterThan(0);
  });

  it("falls back to the base view when the Garmin enricher throws (graceful omission)", async () => {
    garminVisualDataMock.mockRejectedValue(new Error("garmin unavailable"));

    const activity = makeActivity({ provider: "GARMIN", sportType: "run" });

    await expect(getActivityVisualData(activity)).resolves.toEqual(
      buildBaseActivityVisualData(activity),
    );
    expect(garminVisualDataMock).toHaveBeenCalledTimes(1);
  });

  it("produces hero/overview metrics even when the provider has no physiological/detail data (capability absence)", () => {
    // Atividade de ciclismo Strava: sem dados fisiológicos, ainda assim a visão
    // base entrega métricas a partir dos campos normalizados.
    const activity = makeActivity({
      provider: "STRAVA",
      sportType: "bike",
      averagePace: null,
      averageSpeed: 8.33,
    });
    const view = buildBaseActivityVisualData(activity);

    expect(view.sportKey).toBe("bike");
    expect(view.heroStats.some((stat) => stat.label === "Duração")).toBe(true);
    expect(view.overviewMetrics.some((row) => row.label === "Início")).toBe(true);
    expect(view.overviewMetrics.some((row) => row.label === "Distância")).toBe(true);
  });

  it("builds a proper base view for a Garmin activity too", () => {
    const activity = makeActivity({ provider: "GARMIN", sportType: "open-water" });
    const view = buildBaseActivityVisualData(activity);

    expect(view.provider).toBe("GARMIN");
    expect(view.sportKey).toBe("open-water");
    expect(view.heroStats.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. União de capabilities: decide seções fisiológicas do dashboard/relatório
//    sem citar provider (Req 9.3 / 21.1). Testável sem DB.
// ---------------------------------------------------------------------------
describe("capability union drives optional physiological sections", () => {
  const PHYSIOLOGICAL = ["recovery", "sleep", "hrv", "readiness"] as const;

  function hasAnyPhysiological(providers: ProviderId[]): boolean {
    const caps = getUserCapabilities(providers);
    return PHYSIOLOGICAL.some((cap) => caps[cap] === true);
  }

  it("no provider: empty capabilities, no physiological sections, safe", () => {
    expect(getUserCapabilities([])).toEqual({});
    expect(hasAnyPhysiological([])).toBe(false);
  });

  it("Garmin only: exposes physiological capabilities", () => {
    const caps = getUserCapabilities(["GARMIN"]);
    expect(caps.recovery).toBe(true);
    expect(caps.sleep).toBe(true);
    expect(caps.hrv).toBe(true);
    expect(hasAnyPhysiological(["GARMIN"])).toBe(true);
  });

  it("Strava only: NO physiological capabilities (activities/streams only)", () => {
    const caps = getUserCapabilities(["STRAVA"]);
    expect(caps.recovery).toBeUndefined();
    expect(caps.sleep).toBeUndefined();
    expect(caps.hrv).toBeUndefined();
    expect(caps.readiness).toBeUndefined();
    expect(caps.activities).toBe(true);
    expect(hasAnyPhysiological(["STRAVA"])).toBe(false);
  });

  it("both: union keeps physiological (Garmin) plus Strava streams", () => {
    const caps = getUserCapabilities(["GARMIN", "STRAVA"]);
    expect(caps.recovery).toBe(true);
    expect(caps.streams).toBe(true);
    expect(caps.activities).toBe(true);
    expect(hasAnyPhysiological(["GARMIN", "STRAVA"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. getAvailableDailyInsights (Prisma + Garmin mockados): quatro cenários.
// ---------------------------------------------------------------------------
describe("getAvailableDailyInsights (mocked Prisma + Garmin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    garminSnapshotMock.mockResolvedValue(GARMIN_SNAPSHOT);
    garminReconnectMock.mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no provider: empty result, no physiological fetch, does not throw", async () => {
    findManyMock.mockResolvedValue([] as never);

    const result = await getAvailableDailyInsights("user_1");

    expect(result.connectedProviders).toEqual([]);
    expect(result.capabilities).toEqual({});
    expect(result.garminSnapshot).toBeNull();
    expect(garminSnapshotMock).not.toHaveBeenCalled();
  });

  it("Garmin only: fetches physiological snapshot", async () => {
    findManyMock.mockResolvedValue([connection("GARMIN")] as never);

    const result = await getAvailableDailyInsights("user_1");

    expect(result.connectedProviders).toEqual(["GARMIN"]);
    expect(result.capabilities.recovery).toBe(true);
    expect(result.garminSnapshot).toBe(GARMIN_SNAPSHOT);
    expect(garminSnapshotMock).toHaveBeenCalledWith("user_1");
  });

  it("Strava only: no physiological capability, no fetch, no throw", async () => {
    findManyMock.mockResolvedValue([connection("STRAVA")] as never);

    const result = await getAvailableDailyInsights("user_1");

    expect(result.connectedProviders).toEqual(["STRAVA"]);
    expect(result.capabilities.recovery).toBeUndefined();
    expect(result.capabilities.activities).toBe(true);
    expect(result.garminSnapshot).toBeNull();
    expect(garminSnapshotMock).not.toHaveBeenCalled();
  });

  it("both providers: union capabilities and Garmin snapshot present", async () => {
    findManyMock.mockResolvedValue([
      connection("GARMIN"),
      connection("STRAVA"),
    ] as never);

    const result = await getAvailableDailyInsights("user_1");

    expect(result.connectedProviders.sort()).toEqual(["GARMIN", "STRAVA"]);
    expect(result.capabilities.recovery).toBe(true);
    expect(result.capabilities.streams).toBe(true);
    expect(result.garminSnapshot).toBe(GARMIN_SNAPSHOT);
    expect(garminSnapshotMock).toHaveBeenCalledWith("user_1");
  });

  it("does not fetch Garmin data when the Garmin connection needs reconnect (capability present but inactive)", async () => {
    findManyMock.mockResolvedValue([
      connection("GARMIN", "RECONNECT_REQUIRED"),
    ] as never);

    const result = await getAvailableDailyInsights("user_1");

    // Provider ainda conta como conectado (não DISCONNECTED), mas o snapshot não
    // é buscado enquanto a conexão exige reconexão.
    expect(result.connectedProviders).toEqual(["GARMIN"]);
    expect(result.garminSnapshot).toBeNull();
    expect(garminSnapshotMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. getDashboardData (mocked Prisma + Garmin): connectedProviders adaptativo.
// ---------------------------------------------------------------------------
describe("getDashboardData (mocked Prisma + Garmin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activityFindManyMock.mockResolvedValue([] as never);
    activityFindFirstMock.mockResolvedValue(null as never);
    whatsappFindUniqueMock.mockResolvedValue(null as never);
    garminSnapshotMock.mockResolvedValue(GARMIN_SNAPSHOT);
    garminReconnectMock.mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no provider: dashboard renders with empty connectedProviders and no physiological data", async () => {
    findManyMock.mockResolvedValue([] as never);

    const data = await getDashboardData("user_1", 30);

    expect(data.connectedProviders).toEqual([]);
    expect(data.summary.connectedProviders).toEqual([]);
    expect(data.summary.capabilities).toEqual({});
    expect(data.summary.garminToday).toBeNull();
  });

  it("Strava only: connected provider present, no physiological section, does not break", async () => {
    findManyMock.mockResolvedValue([connection("STRAVA")] as never);

    const data = await getDashboardData("user_1", 30);

    expect(data.connectedProviders).toEqual(["STRAVA"]);
    expect(data.summary.capabilities.activities).toBe(true);
    expect(data.summary.capabilities.recovery).toBeUndefined();
    expect(data.summary.garminToday).toBeNull();
    expect(garminSnapshotMock).not.toHaveBeenCalled();
  });

  it("both providers: connectedProviders reflects union and Garmin snapshot is exposed", async () => {
    findManyMock.mockResolvedValue([
      connection("GARMIN"),
      connection("STRAVA"),
    ] as never);

    const data = await getDashboardData("user_1", 30);

    expect(data.connectedProviders.sort()).toEqual(["GARMIN", "STRAVA"]);
    expect(data.summary.capabilities.recovery).toBe(true);
    expect(data.summary.garminToday).toBe(GARMIN_SNAPSHOT);
  });
});
