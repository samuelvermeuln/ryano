/**
 * E2E — 51 (SAM-52): campos do evento por modalidade, pela API.
 *
 * Requer a migração 0060_sport_events aplicada.
 *
 * Maria cadastra uma travessia com a temperatura da água prevista pelo
 * organizador (ar não informado) e um triathlon com cinco segmentos e cortes;
 * reabre cada evento e confere: a água traz a proveniência, o ar aparece
 * "desconhecida" (não copia a água) e os segmentos voltam na ordem com cortes.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ALUNOS } from "./fixtures";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 180_000 });

async function entrar(request: APIRequestContext) {
  const response = await request.post("/api/e2e/login", { data: { email: MARIA.email, password: MARIA.password } });
  expect(response.ok(), `login: ${response.status()}`).toBe(true);
}

type Row = { label: string; value: string; provenance: string | null };

test("travessia com condições e proveniência; triathlon com segmentos", async ({ playwright, baseURL }) => {
  const maria = await playwright.request.newContext({ baseURL });
  await entrar(maria);

  const travessia = await maria.post("/api/events", {
    data: {
      confirmDistinct: true,
      event: {
        name: `Travessia condições ${RUN}`, type: "ORGANIZED_CROSSING", sportType: "open-water", environment: "SEA",
        startLocalDate: "2026-12-20", timeZone: "America/Sao_Paulo", city: "Niterói",
        details: {
          water: "SALT",
          conditions: { waterTemperature: { value: 21, unit: "°C", source: "FORECAST", sourceName: "organizador", observedAt: "2026-12-10T09:00:00-03:00" } },
        },
      },
      option: { label: "2 km", distanceValue: 2, distanceUnit: "km", details: { classification: "POINT_TO_POINT" } },
    },
  });
  expect(travessia.status(), await travessia.text()).toBe(201);
  const { eventId: travessiaId } = (await travessia.json()) as { eventId: string };

  const lida = (await (await maria.get(`/api/events/${travessiaId}`)).json()) as { conditions: Row[] };
  expect(lida.conditions.find((row) => row.label === "Temperatura da água")).toMatchObject({ value: "21 °C", provenance: "previsão, organizador, 10/12" });
  expect(lida.conditions.find((row) => row.label === "Temperatura do ar")).toMatchObject({ value: "desconhecida", provenance: null });

  const triathlon = await maria.post("/api/events", {
    data: {
      confirmDistinct: true,
      event: { name: `Triathlon E2E ${RUN}`, type: "COMPETITION", sportType: "triathlon", startLocalDate: "2027-03-14", timeZone: "America/Sao_Paulo" },
      option: {
        label: "Olímpico",
        details: {
          format: "OLYMPIC",
          segments: [
            { kind: "SWIM", distanceValue: 1.5, distanceUnit: "km", cutoffMinutes: 50 },
            { kind: "T1" },
            { kind: "BIKE", distanceValue: 40, distanceUnit: "km", cutoffMinutes: 150 },
            { kind: "T2" },
            { kind: "RUN", distanceValue: 10, distanceUnit: "km", cutoffMinutes: 230 },
          ],
        },
      },
    },
  });
  expect(triathlon.status(), await triathlon.text()).toBe(201);
  const { eventId: triathlonId } = (await triathlon.json()) as { eventId: string };
  const tri = (await (await maria.get(`/api/events/${triathlonId}`)).json()) as { options: Array<{ segments: Row[] }> };
  expect(tri.options[0]!.segments.map((row) => row.label)).toEqual(["Natação", "T1", "Ciclismo", "T2", "Corrida"]);
  expect(tri.options[0]!.segments[4]!.value).toBe("10 km · corte 230 min");

  // Campo de outra modalidade é recusado.
  const errado = await maria.post("/api/events", {
    data: { confirmDistinct: true, event: { name: `Piscina ${RUN}`, type: "COMPETITION", sportType: "swim", startLocalDate: "2027-01-10", timeZone: "America/Sao_Paulo" }, option: { label: "100 livre", details: { segments: [] } } },
  });
  expect(errado.status()).toBe(400);

  await maria.dispose();
});
