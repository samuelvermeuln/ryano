import type { ProviderConnectedAccount } from "../domain/seller-account";

/**
 * SAM-13 — contrato mínimo que a aplicação exige do provedor financeiro para
 * onboarding de contas de recebimento. A implementação real vive em
 * `infrastructure/stripe-payment-provider.ts`; os testes usam um fake.
 */
export interface CreateConnectedAccountInput {
  sellerType: "COACH" | "SCHOOL";
  sellerId: string;
  email: string | null;
  businessType: "individual" | "company";
  displayName: string;
}

export interface SellerOnboardingProvider {
  readonly providerId: string;
  createConnectedAccount(input: CreateConnectedAccountInput): Promise<{ accountRef: string }>;
  createOnboardingLink(input: { accountRef: string; returnUrl: string; refreshUrl: string }): Promise<{ url: string }>;
  createDashboardLink(accountRef: string): Promise<{ url: string }>;
  retrieveConnectedAccount(accountRef: string): Promise<ProviderConnectedAccount>;
}

/** Lançado pela infraestrutura quando o provedor não está configurado neste ambiente. */
export const PROVIDER_NOT_CONFIGURED = "STRIPE_NOT_CONFIGURED";
