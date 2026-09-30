/**
 * SAM-13 — conta de recebimento: status derivado do provedor, autorização do
 * onboarding (professor só a própria; escola só OWNER/ADMIN), independência
 * professor × escola, sincronização que nunca "verifica" por conta própria.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  deriveSellerPayoutStatus,
  isSellerPayoutEligible,
  mapProviderAccountToSellerState,
  sellerPayoutPrimaryAction,
  type ProviderConnectedAccount,
} from "@/modules/school/domain/seller-account";
import { GetSellerPayoutAccounts } from "@/modules/school/application/get-seller-payout-accounts";
import { StartSellerOnboarding } from "@/modules/school/application/start-seller-onboarding";
import { SyncSellerAccountStatus } from "@/modules/school/application/sync-seller-account-status";
import type { SellerOnboardingProvider } from "@/modules/school/application/seller-onboarding-provider";
import { SchoolError } from "@/modules/school/domain/errors";

const providerAccount = (over: Partial<ProviderConnectedAccount> = {}): ProviderConnectedAccount => ({
  accountRef: "acct_1",
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  requirementsDue: [],
  disabledReason: null,
  ...over,
});

describe("seller-account domain", () => {
  it("deriva o status a partir do estado real do provedor", () => {
    expect(deriveSellerPayoutStatus(null)).toBe("NOT_CONFIGURED");
    expect(deriveSellerPayoutStatus({ payoutAccountRef: null, kycStatus: "PENDING", detailsSubmitted: false, payoutsEnabled: false, requirementsDue: 0, disabledReason: null })).toBe("NOT_CONFIGURED");
    expect(deriveSellerPayoutStatus({ payoutAccountRef: "acct", kycStatus: "PENDING", detailsSubmitted: false, payoutsEnabled: false, requirementsDue: 3, disabledReason: null })).toBe("ONBOARDING_STARTED");
    expect(deriveSellerPayoutStatus({ payoutAccountRef: "acct", kycStatus: "PENDING", detailsSubmitted: true, payoutsEnabled: false, requirementsDue: 0, disabledReason: null })).toBe("PENDING_VERIFICATION");
    expect(deriveSellerPayoutStatus({ payoutAccountRef: "acct", kycStatus: "PENDING", detailsSubmitted: true, payoutsEnabled: false, requirementsDue: 2, disabledReason: null })).toBe("ACTION_REQUIRED");
    expect(deriveSellerPayoutStatus({ payoutAccountRef: "acct", kycStatus: "PENDING", detailsSubmitted: true, payoutsEnabled: false, requirementsDue: 0, disabledReason: "requirements.past_due" })).toBe("ACTION_REQUIRED");
    expect(deriveSellerPayoutStatus({ payoutAccountRef: "acct", kycStatus: "VERIFIED", detailsSubmitted: true, payoutsEnabled: true, requirementsDue: 0, disabledReason: null })).toBe("VERIFIED");
    expect(deriveSellerPayoutStatus({ payoutAccountRef: "acct", kycStatus: "REJECTED", detailsSubmitted: true, payoutsEnabled: false, requirementsDue: 0, disabledReason: "rejected.fraud" })).toBe("BLOCKED");
  });

  it("só é elegível a repasse quando verificada E com repasses habilitados", () => {
    expect(isSellerPayoutEligible({ payoutAccountRef: "acct", kycStatus: "VERIFIED", detailsSubmitted: true, payoutsEnabled: true, requirementsDue: 0, disabledReason: null })).toBe(true);
    // kyc VERIFIED gravado antes, mas o provedor pausou os repasses depois.
    expect(isSellerPayoutEligible({ payoutAccountRef: "acct", kycStatus: "VERIFIED", detailsSubmitted: true, payoutsEnabled: false, requirementsDue: 1, disabledReason: null })).toBe(false);
    expect(isSellerPayoutEligible(null)).toBe(false);
  });

  it("mapeia a conta do provedor: VERIFIED exige payouts+charges; rejected.* vira REJECTED", () => {
    expect(mapProviderAccountToSellerState(providerAccount({ detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true }))).toMatchObject({ kycStatus: "VERIFIED", requirementsDue: 0 });
    expect(mapProviderAccountToSellerState(providerAccount({ detailsSubmitted: true, payoutsEnabled: true, chargesEnabled: false }))).toMatchObject({ kycStatus: "PENDING" });
    expect(mapProviderAccountToSellerState(providerAccount({ requirementsDue: ["external_account", "individual.id_number"] }))).toMatchObject({ kycStatus: "PENDING", requirementsDue: 2 });
    expect(mapProviderAccountToSellerState(providerAccount({ disabledReason: "rejected.terms_of_service" }))).toMatchObject({ kycStatus: "REJECTED", disabledReason: "rejected.terms_of_service" });
  });

  it("oferece a ação certa por status", () => {
    expect(sellerPayoutPrimaryAction("NOT_CONFIGURED")).toEqual({ label: "Cadastrar conta de recebimento", kind: "onboard" });
    expect(sellerPayoutPrimaryAction("ONBOARDING_STARTED").label).toBe("Continuar cadastro");
    expect(sellerPayoutPrimaryAction("ACTION_REQUIRED").label).toBe("Resolver pendências");
    expect(sellerPayoutPrimaryAction("PENDING_VERIFICATION").kind).toBe("refresh");
  });
});

function fakeProvider(over: Partial<SellerOnboardingProvider> = {}): SellerOnboardingProvider {
  return {
    providerId: "stripe",
    createConnectedAccount: vi.fn().mockResolvedValue({ accountRef: "acct_new" }),
    createOnboardingLink: vi.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/x" }),
    createDashboardLink: vi.fn().mockResolvedValue({ url: "https://connect.stripe.com/express/y" }),
    retrieveConnectedAccount: vi.fn().mockResolvedValue(providerAccount()),
    ...over,
  };
}

function makeDb(over: Record<string, unknown> = {}) {
  return {
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "ACTIVE", displayName: "Carlos", user: { email: "c@x.test" } }),
    },
    schoolMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: "m-1", schoolId: "school-1", userId: "user-1", status: "ACTIVE", endedAt: null }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    schoolMembershipRole: {
      findMany: vi.fn().mockResolvedValue([{ membershipId: "m-1", role: "OWNER" }]),
    },
    school: {
      findUnique: vi.fn().mockResolvedValue({ name: "Escola Alpha", email: "alpha@x.test", status: "ACTIVE" }),
    },
    sellerAccount: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sa-1", sellerType: "COACH", sellerId: "coach-1", ...data })),
    },
    ...over,
  } as unknown as PrismaClient;
}

const urls = { returnUrl: "https://ryvano.test/app/perfil?recebimento=retorno", refreshUrl: "https://ryvano.test/app/perfil?recebimento=expirado" };

describe("StartSellerOnboarding", () => {
  it("professor cria a connected account uma vez e recebe link de onboarding", async () => {
    const db = makeDb();
    const provider = fakeProvider();
    const result = await new StartSellerOnboarding(db, provider).execute("user-1", { sellerType: "COACH", sellerId: "coach-1", ...urls });

    expect(result.url).toContain("connect.stripe.com");
    expect(provider.createConnectedAccount).toHaveBeenCalledWith(expect.objectContaining({ sellerType: "COACH", sellerId: "coach-1", businessType: "individual", email: "c@x.test" }));
    expect((db.sellerAccount.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      where: { sellerType_sellerId_provider: { sellerType: "COACH", sellerId: "coach-1", provider: "stripe" } },
      create: { payoutAccountRef: "acct_new" },
    });
  });

  it("reaproveita a connected account existente (link novo, conta não duplicada)", async () => {
    const db = makeDb({ sellerAccount: { findUnique: vi.fn().mockResolvedValue({ id: "sa", payoutAccountRef: "acct_old" }), upsert: vi.fn() } });
    const provider = fakeProvider();
    await new StartSellerOnboarding(db, provider).execute("user-1", { sellerType: "COACH", sellerId: "coach-1", ...urls });

    expect(provider.createConnectedAccount).not.toHaveBeenCalled();
    expect(provider.createOnboardingLink).toHaveBeenCalledWith(expect.objectContaining({ accountRef: "acct_old" }));
    expect(db.sellerAccount.upsert).not.toHaveBeenCalled();
  });

  it("professor não configura a conta de outro professor (id manipulado na requisição)", async () => {
    await expect(
      new StartSellerOnboarding(makeDb(), fakeProvider()).execute("user-1", { sellerType: "COACH", sellerId: "coach-OTHER", ...urls }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("perfil de professor inativo não inicia onboarding", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-1", status: "SUSPENDED", displayName: "C", user: { email: null } }) } });
    await expect(new StartSellerOnboarding(db, fakeProvider()).execute("user-1", { sellerType: "COACH", sellerId: "coach-1", ...urls })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("escola: OWNER/ADMIN configura a conta DA ESCOLA (business company, e-mail da escola)", async () => {
    const db = makeDb();
    const provider = fakeProvider();
    await new StartSellerOnboarding(db, provider).execute("user-1", { sellerType: "SCHOOL", sellerId: "school-1", ...urls });

    expect(provider.createConnectedAccount).toHaveBeenCalledWith(expect.objectContaining({ sellerType: "SCHOOL", sellerId: "school-1", businessType: "company", email: "alpha@x.test", displayName: "Escola Alpha" }));
    // Nunca toca a linha do professor.
    expect((db.sellerAccount.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0].where.sellerType_sellerId_provider).toEqual({ sellerType: "SCHOOL", sellerId: "school-1", provider: "stripe" });
  });

  it("membro comum da escola (sem OWNER/ADMIN) é bloqueado no backend", async () => {
    const db = makeDb({ schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([{ membershipId: "m-1", role: "COACH" }]) } });
    await expect(new StartSellerOnboarding(db, fakeProvider()).execute("user-1", { sellerType: "SCHOOL", sellerId: "school-1", ...urls })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sem sessão → UNAUTHORIZED; provedor não configurado → PAYMENT_PROVIDER_UNAVAILABLE (503)", async () => {
    await expect(new StartSellerOnboarding(makeDb(), fakeProvider()).execute(null, { sellerType: "COACH", sellerId: "coach-1", ...urls })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const provider = fakeProvider({ createConnectedAccount: vi.fn().mockRejectedValue(new Error("STRIPE_NOT_CONFIGURED")) });
    const error = await new StartSellerOnboarding(makeDb(), provider).execute("user-1", { sellerType: "COACH", sellerId: "coach-1", ...urls }).catch((e) => e);
    expect(error).toBeInstanceOf(SchoolError);
    expect(error).toMatchObject({ code: "PAYMENT_PROVIDER_UNAVAILABLE", status: 503 });
  });

  it("link do painel exige conta já conectada e a mesma autorização", async () => {
    await expect(new StartSellerOnboarding(makeDb(), fakeProvider()).dashboardLink("user-1", { sellerType: "COACH", sellerId: "coach-1" })).rejects.toMatchObject({ code: "SELLER_ACCOUNT_NOT_CONFIGURED" });
    const db = makeDb({ sellerAccount: { findUnique: vi.fn().mockResolvedValue({ payoutAccountRef: "acct_old" }) } });
    await expect(new StartSellerOnboarding(db, fakeProvider()).dashboardLink("user-1", { sellerType: "COACH", sellerId: "coach-1" })).resolves.toEqual({ url: "https://connect.stripe.com/express/y" });
  });
});

describe("SyncSellerAccountStatus", () => {
  it("espelha o estado do provedor e registra a primeira verificação", async () => {
    const db = makeDb({ sellerAccount: { findFirst: vi.fn().mockResolvedValue({ id: "sa-1", verifiedAt: null }), update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "sa-1", sellerType: "COACH", sellerId: "coach-1", kycStatus: data.kycStatus, payoutsEnabled: data.payoutsEnabled, requirementsDue: data.requirementsDue })) } });
    const result = await new SyncSellerAccountStatus(db).applyProviderAccount("stripe", providerAccount({ detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true }));

    expect(result).toMatchObject({ applied: true, account: { kycStatus: "VERIFIED", payoutsEnabled: true } });
    const data = (db.sellerAccount.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.verifiedAt).toBeInstanceOf(Date);
    expect(data.providerSyncedAt).toBeInstanceOf(Date);
  });

  it("não regride verifiedAt quando o provedor pausa depois, e ignora conta desconhecida", async () => {
    const firstVerified = new Date("2026-09-01T00:00:00Z");
    const db = makeDb({ sellerAccount: { findFirst: vi.fn().mockResolvedValue({ id: "sa-1", verifiedAt: firstVerified }), update: vi.fn().mockResolvedValue({ id: "sa-1", sellerType: "COACH", sellerId: "coach-1", kycStatus: "PENDING", payoutsEnabled: false, requirementsDue: 1 }) } });
    await new SyncSellerAccountStatus(db).applyProviderAccount("stripe", providerAccount({ detailsSubmitted: true, requirementsDue: ["external_account"] }));
    expect((db.sellerAccount.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data.verifiedAt).toBe(firstVerified);

    const unknown = makeDb();
    await expect(new SyncSellerAccountStatus(unknown).applyProviderAccount("stripe", providerAccount({ accountRef: "acct_alien" }))).resolves.toEqual({ applied: false, reason: "unknown_account" });
    expect(unknown.sellerAccount.update).not.toHaveBeenCalled();
  });

  it("refresh consulta o provedor apenas quando há payoutAccountRef", async () => {
    const provider = fakeProvider();
    await expect(new SyncSellerAccountStatus(makeDb()).refresh(provider, "COACH", "coach-1")).resolves.toEqual({ applied: false, reason: "not_configured" });
    expect(provider.retrieveConnectedAccount).not.toHaveBeenCalled();

    const db = makeDb({ sellerAccount: { findUnique: vi.fn().mockResolvedValue({ payoutAccountRef: "acct_old" }), findFirst: vi.fn().mockResolvedValue({ id: "sa-1", verifiedAt: null }), update: vi.fn().mockResolvedValue({ id: "sa-1", sellerType: "COACH", sellerId: "coach-1", kycStatus: "PENDING", payoutsEnabled: false, requirementsDue: 0 }) } });
    await new SyncSellerAccountStatus(db).refresh(provider, "COACH", "coach-1");
    expect(provider.retrieveConnectedAccount).toHaveBeenCalledWith("acct_old");
  });
});

describe("GetSellerPayoutAccounts", () => {
  it("atleta/membro comum não tem beneficiário (a seção não aparece)", async () => {
    const db = makeDb({ coachProfile: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(new GetSellerPayoutAccounts(db).execute("user-1")).resolves.toEqual([]);
  });

  it("professor vê só a própria conta; gestor vê a da escola; ambos quando acumula papéis — contas independentes", async () => {
    const db = makeDb({
      schoolMembership: { findMany: vi.fn().mockResolvedValue([{ schoolId: "school-1", school: { name: "Escola Alpha" } }]) },
      sellerAccount: {
        findMany: vi.fn().mockResolvedValue([
          { sellerType: "COACH", sellerId: "coach-1", provider: "stripe", payoutAccountRef: "acct_c", kycStatus: "VERIFIED", detailsSubmitted: true, payoutsEnabled: true, requirementsDue: 0, disabledReason: null, verifiedAt: new Date("2026-09-10T00:00:00Z"), providerSyncedAt: null },
        ]),
      },
    });
    const accounts = await new GetSellerPayoutAccounts(db).execute("user-1");

    expect(accounts.map((a) => [a.sellerType, a.beneficiaryName, a.status])).toEqual([
      ["COACH", "Carlos", "VERIFIED"],
      ["SCHOOL", "Escola Alpha", "NOT_CONFIGURED"],
    ]);
    expect(accounts[0].payoutEligible).toBe(true);
    expect(accounts[1].payoutEligible).toBe(false);
  });
});
