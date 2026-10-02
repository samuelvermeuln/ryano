/**
 * SAM-42 — `ProviderModule` do Garmin para o `providerRegistry` do core.
 *
 * Fecha o que o catálogo declara para o GARMIN com os contratos genéricos
 * (o teste `registry/capability-contract.test.ts` falha se um deles faltar):
 * - `activity` (ActivityProvider): listagem/normalização via
 *   `garminProvider.syncActivities` + `parseGarminActivity`, paginada como o
 *   serviço de sync faz (`start`/`limit`); a chave da conta vem do acessor de
 *   secrets do contexto (`GARMIN_API_KEY`). Não persiste nada: persistência e
 *   Policy Gate continuam em `syncGarminForUser`.
 * - `activityDetail` (ActivityDetailProvider, SAM-39): o DTO rico é montado
 *   do resumo e dos splits já persistidos (`buildGarminActivityDetail`), sem
 *   chamada extra — por isso lê a linha de `Activity` da conexão.
 * - `dailyHealth` (DailyHealthProvider, SAM-42): `createGarminDailyHealthProvider`.
 * - `webhook`: o Garmin aqui é puxado por chave de conta (`webhooks: false`).
 */
import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type {
  ActivityDetailProvider,
  ActivityProvider,
  ListActivitiesInput,
  NormalizedActivity,
  ProviderContext,
  ProviderModule,
} from "@/modules/shared/integrations/contracts";
import type { ProviderAuthType } from "@/modules/shared/integrations/types";
import type { NormalizedActivityDetail } from "@/modules/shared/activities/contracts";
import { buildGarminActivityDetail } from "@/modules/garmin/application/activities/garmin-activity-detail-provider";
import { createGarminDailyHealthProvider } from "@/modules/garmin/application/daily/garmin-daily-health";
import { garminProvider } from "@/modules/garmin/infrastructure/provider";
import { parseGarminActivity } from "@/modules/garmin/parsers/parse-garmin-activity";
import { prisma } from "@/server/db";

const GARMIN_API_KEY_SECRET = "GARMIN_API_KEY";
const DEFAULT_PAGE_SIZE = 50;

function garminBaseMeta(): { capabilities: ProviderCapabilities; authType: ProviderAuthType } {
  const definition = getProviderDefinition("GARMIN");
  return {
    capabilities: (definition?.capabilities ?? { activities: true }) as ProviderCapabilities,
    authType: definition?.authType ?? "CREDENTIALS",
  };
}

async function requireAccountApiKey(ctx: ProviderContext): Promise<string> {
  const key = await ctx.secrets.getSecret(GARMIN_API_KEY_SECRET);
  if (!key) throw new Error("GARMIN_ACCOUNT_API_KEY_MISSING");
  return key;
}

type GarminActivityClient = Pick<typeof garminProvider, "syncActivities" | "getActivitySummary">;

export function createGarminActivityProvider(client: GarminActivityClient = garminProvider): ActivityProvider {
  const { capabilities, authType } = garminBaseMeta();
  return {
    id: "GARMIN",
    capabilities,
    authType,
    async listActivities(ctx: ProviderContext, input: ListActivitiesInput): Promise<NormalizedActivity[]> {
      const accountApiKey = await requireAccountApiKey(ctx);
      const limit = input.limit ?? DEFAULT_PAGE_SIZE;
      const start = Math.max(0, ((input.page ?? 1) - 1) * limit);
      const raw = await client.syncActivities({ accountApiKey, limit, start });
      return raw
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => parseGarminActivity(item))
        .filter((activity) => (!input.since || activity.startedAt >= input.since) && (!input.until || activity.startedAt <= input.until));
    },
    async getActivity(ctx: ProviderContext, externalId: string): Promise<NormalizedActivity | null> {
      const accountApiKey = await requireAccountApiKey(ctx);
      const summary = await client.getActivitySummary({ accountApiKey, activityId: externalId });
      return summary && typeof summary === "object" ? parseGarminActivity(summary) : null;
    },
  };
}

export function createGarminActivityDetailProvider(db: Pick<typeof prisma, "activity"> = prisma): ActivityDetailProvider {
  const { capabilities, authType } = garminBaseMeta();
  return {
    id: "GARMIN",
    capabilities,
    authType,
    async getActivityDetail(ctx: ProviderContext, externalId: string): Promise<NormalizedActivityDetail | null> {
      const activity = await db.activity.findUnique({
        where: { provider_externalId_userId: { provider: "GARMIN", externalId, userId: ctx.userId } },
        select: { externalId: true, metrics: true },
      });
      return activity ? buildGarminActivityDetail(activity) : null;
    },
  };
}

export const garminModule: ProviderModule = {
  id: "GARMIN",
  activity: createGarminActivityProvider(),
  activityDetail: createGarminActivityDetailProvider(),
  dailyHealth: createGarminDailyHealthProvider(),
};
