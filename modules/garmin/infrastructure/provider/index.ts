/**
 * Fiação (wiring) do provider Garmin.
 *
 * Movido de `server/providers/wearables/garmin.ts` na tarefa 2.1. A classe
 * `GarminProvider` (camada HTTP) vive em `api/client/garmin-client.ts`; aqui
 * apenas instanciamos o singleton consumido pela aplicação, preservando o
 * comportamento anterior (mesma instância exportada como `garminProvider`).
 *
 * _Requisitos: 5.1, 5.5_
 */

import { GarminProvider } from "@/modules/garmin/api/client/garmin-client";

export { GarminProvider };

export const garminProvider = new GarminProvider();
