/**
 * TM067 (RF-205) — recordMarketplaceSaleLedgerEntry /
 * recordMarketplaceRefundLedgerEntry: seller upsert, fee computed from the
 * bps passed in (never a hardcoded percentage here), and refund reversal
 * mirrors the original SALE entry exactly.
 */
import { describe, expect, it, vi } from "vitest";
import {
  recordMarketplaceRefundLedgerEntry,
  recordMarketplaceSaleLedgerEntry,
} from "@/modules/school/application/record-marketplace-ledger-entry";

function makeTx(over: Record<string, unknown> = {}) {
  return {
    sellerAccount: { upsert: vi.fn().mockResolvedValue({ id: "seller-acc-1" }) },
    sellerLedgerEntry: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "ledger-1", ...data })),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ...over,
  };
}

describe("recordMarketplaceSaleLedgerEntry [TM067]", () => {
  it("upsert do SellerAccount por (sellerType, sellerId, provider) — nunca duplica conta do vendedor", async () => {
    const tx = makeTx();
    await recordMarketplaceSaleLedgerEntry(tx, {
      purchaseId: "pur-1", sellerType: "COACH", sellerId: "coach-1", provider: "stripe",
      grossAmount: 10000, currency: "BRL", feeBps: 1500,
    });
    expect(tx.sellerAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerType_sellerId_provider: { sellerType: "COACH", sellerId: "coach-1", provider: "stripe" } },
    }));
  });

  it("calcula fee/net a partir do feeBps recebido — 15% de 10000 = 1500 de taxa, 8500 líquido", async () => {
    const tx = makeTx();
    const entry = await recordMarketplaceSaleLedgerEntry(tx, {
      purchaseId: "pur-1", sellerType: "COACH", sellerId: "coach-1", provider: "stripe",
      grossAmount: 10000, currency: "BRL", feeBps: 1500,
    });
    expect(entry).toMatchObject({ grossAmount: 10000, feeAmount: 1500, netAmount: 8500, type: "SALE" });
  });

  it("arredonda a taxa (não deixa fração de centavo solta)", async () => {
    const tx = makeTx();
    const entry = await recordMarketplaceSaleLedgerEntry(tx, {
      purchaseId: "pur-1", sellerType: "SCHOOL", sellerId: "school-1", provider: "stripe",
      grossAmount: 4990, currency: "BRL", feeBps: 1500,
    });
    // 4990 * 0.15 = 748.5 -> arredondado para 748 ou 749, nunca fracionário
    expect(Number.isInteger((entry as { feeAmount: number }).feeAmount)).toBe(true);
  });
});

describe("recordMarketplaceRefundLedgerEntry [TM067]", () => {
  it("reverte exatamente os valores da entrada SALE original (nunca recalcula com a config atual)", async () => {
    const tx = makeTx({
      sellerLedgerEntry: {
        findFirst: vi.fn().mockResolvedValue({ sellerAccountId: "seller-acc-1", grossAmount: 10000, feeAmount: 1500, netAmount: 8500, currency: "BRL" }),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "ledger-2", ...data })),
      },
    });
    const entry = await recordMarketplaceRefundLedgerEntry(tx, "pur-1");
    expect(entry).toMatchObject({ grossAmount: -10000, feeAmount: -1500, netAmount: -8500, type: "REFUND", sellerAccountId: "seller-acc-1" });
  });

  it("sem entrada SALE para a compra: retorna null, não cria nada (não é um erro)", async () => {
    const tx = makeTx();
    const entry = await recordMarketplaceRefundLedgerEntry(tx, "pur-sem-venda");
    expect(entry).toBeNull();
    expect(tx.sellerLedgerEntry.create).not.toHaveBeenCalled();
  });
});
