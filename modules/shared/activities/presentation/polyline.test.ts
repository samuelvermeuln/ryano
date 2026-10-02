import { describe, expect, it } from "vitest";
import { decodePolyline } from "@/modules/shared/activities/presentation/polyline";

describe("decodePolyline", () => {
  it("decodifica o exemplo de referência do formato", () => {
    // Exemplo canônico da especificação do algoritmo (Google).
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it("string vazia ou truncada não lança: devolve o que conseguiu ler", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline("_p~iF~ps|U_ul")).toEqual([[38.5, -120.2]]);
  });
});
