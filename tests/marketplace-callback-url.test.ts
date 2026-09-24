/**
 * TM037 (RF-107) — open-redirect protection for the marketplace buyer entry
 * point. This is the security-critical unit under test: everything else in
 * TM037 (entrar/page.tsx, entrar-client.tsx, the detail page CTA) is wiring
 * around this validator/builder pair.
 */
import { describe, expect, it } from "vitest";
import {
  buildMarketplaceCallbackUrl,
  isSafeMarketplaceCallbackPath,
  MarketplaceCallbackIntent,
  parseSafeMarketplaceCallbackPath,
} from "@/modules/school/domain/marketplace-callback-url";

describe("isSafeMarketplaceCallbackPath [TM037, RF-107]", () => {
  it("rejeita uma URL externa absoluta — o caso de open-redirect canônico", () => {
    expect(isSafeMarketplaceCallbackPath("https://evil.example.com")).toBe(false);
  });

  it("rejeita uma URL externa absoluta mesmo tentando parecer um caminho do marketplace", () => {
    expect(isSafeMarketplaceCallbackPath("https://evil.example.com/marketplace/x")).toBe(false);
  });

  it("rejeita URL protocol-relative (//host)", () => {
    expect(isSafeMarketplaceCallbackPath("//evil.example.com/marketplace/x")).toBe(false);
  });

  it("rejeita esquema smuggled depois do prefixo", () => {
    expect(isSafeMarketplaceCallbackPath("/marketplace/https://evil.example.com")).toBe(false);
    expect(isSafeMarketplaceCallbackPath("/marketplace/javascript:alert(1)")).toBe(false);
  });

  it("rejeita truque de backslash", () => {
    expect(isSafeMarketplaceCallbackPath("/marketplace/\\evil.example.com")).toBe(false);
  });

  it("rejeita caminho interno fora do namespace /marketplace/ (não é 'qualquer rota', é escopado)", () => {
    expect(isSafeMarketplaceCallbackPath("/admin")).toBe(false);
    expect(isSafeMarketplaceCallbackPath("/app/dashboard")).toBe(false);
    expect(isSafeMarketplaceCallbackPath("/marketplace")).toBe(false); // sem barra final/produto
  });

  it("rejeita valores não-string, vazios ou absurdamente longos", () => {
    expect(isSafeMarketplaceCallbackPath(undefined)).toBe(false);
    expect(isSafeMarketplaceCallbackPath(null)).toBe(false);
    expect(isSafeMarketplaceCallbackPath(123)).toBe(false);
    expect(isSafeMarketplaceCallbackPath("")).toBe(false);
    expect(isSafeMarketplaceCallbackPath("/marketplace/" + "a".repeat(3000))).toBe(false);
  });

  it("aceita um caminho interno válido de produto do marketplace", () => {
    expect(isSafeMarketplaceCallbackPath("/marketplace/plano-1?intent=purchase")).toBe(true);
  });

  it("parseSafeMarketplaceCallbackPath retorna null (nunca lança) para entrada insegura", () => {
    expect(parseSafeMarketplaceCallbackPath("https://evil.example.com")).toBeNull();
    expect(parseSafeMarketplaceCallbackPath("/marketplace/plano-1")).toBe("/marketplace/plano-1");
  });
});

describe("buildMarketplaceCallbackUrl [TM037]", () => {
  it("constrói uma URL sempre interna e válida (o servidor nunca precisa confiar em input externo no caso comum)", () => {
    const url = buildMarketplaceCallbackUrl({ productId: "p1", intent: MarketplaceCallbackIntent.PURCHASE });
    expect(url).toBe("/marketplace/p1?intent=purchase");
    expect(isSafeMarketplaceCallbackPath(url)).toBe(true);
  });

  it("preserva productId, versionId e intent (RF-107 explícito)", () => {
    const url = buildMarketplaceCallbackUrl({ productId: "p1", versionId: "v2", intent: MarketplaceCallbackIntent.ACQUIRE_FREE });
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe("/marketplace/p1");
    expect(parsed.searchParams.get("versionId")).toBe("v2");
    expect(parsed.searchParams.get("intent")).toBe("acquire-free");
  });

  it("codifica o productId defensivamente (id/slug nunca deveria carregar isso, mas a URL sempre fica bem formada)", () => {
    const url = buildMarketplaceCallbackUrl({ productId: "id com espaço", intent: MarketplaceCallbackIntent.VIEW });
    expect(url).toBe(`/marketplace/${encodeURIComponent("id com espaço")}?intent=view`);
    expect(isSafeMarketplaceCallbackPath(url)).toBe(true);
  });
});
