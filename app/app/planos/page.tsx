/**
 * TM043 (RF-111) — "/app/planos": the athlete's own licenses, grouped by
 * state (aguardando pagamento, não iniciado, em andamento, pausado,
 * concluído, reembolsado). Each state has its own UI (RNF-011) — no bucket
 * falls back to a generic label.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconArrowRight } from "@tabler/icons-react";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { ListMyTrainingLicenses, type MyTrainingLicenseSummary, type MyPendingTrainingPurchaseSummary } from "@/modules/school/application/list-my-training-licenses";
import { buildNoIndexMetadata } from "@/server/seo";
import { isRyvanoSportType, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { sportEmoji } from "../treinos/constants";
import { PLAN_STATE_CONFIG } from "./constants";

export const metadata = buildNoIndexMetadata({
  title: "Meus planos — Ryvano",
  description: "Planos de treino adquiridos no marketplace.",
  path: "/app/planos",
});

export const dynamic = "force-dynamic";

const list = new ListMyTrainingLicenses(prisma);

function sportLabel(sportType: string | null): string {
  if (!sportType) return "Modalidade a definir";
  return isRyvanoSportType(sportType) ? getRyvanoSportLabel(sportType) : sportType;
}

export default async function PlanosPage() {
  if (!isMarketplaceEnabled()) redirect("/app/dashboard");

  const session = await requireOnboardedSession();
  const { licenses, pendingPurchases } = await list.execute(session.user.id, {});

  const isEmpty = licenses.length === 0 && pendingPurchases.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meus planos</h1>
        <p className="text-sm text-foreground/50 mt-0.5">Planos de treino adquiridos no marketplace</p>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center space-y-3">
          <p className="text-sm text-foreground/60">Você ainda não adquiriu nenhum plano.</p>
          <Link
            href="/marketplace"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Explorar o marketplace
            <IconArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingPurchases.map((purchase) => (
            <PendingPurchaseCard key={purchase.purchaseId} purchase={purchase} />
          ))}
          {licenses.map((license) => (
            <LicenseCard key={license.licenseId} license={license} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatePill({ state }: { state: keyof typeof PLAN_STATE_CONFIG }) {
  const cfg = PLAN_STATE_CONFIG[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function PendingPurchaseCard({ purchase }: { purchase: MyPendingTrainingPurchaseSummary }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3.5">
      <span className="text-2xl leading-none">{sportEmoji(purchase.product?.sportType ?? "")}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{purchase.product?.title ?? "Plano de treino"}</p>
        <p className="text-xs text-foreground/50 mt-0.5">
          Confirmação de pagamento pendente — verificaremos automaticamente assim que for aprovada.
        </p>
      </div>
      <StatePill state="awaiting_payment" />
    </div>
  );
}

function LicenseCard({ license }: { license: MyTrainingLicenseSummary }) {
  const ctaLabel = ctaForState(license.state);
  return (
    <Link
      href={`/app/planos/${license.licenseId}`}
      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3.5 hover:bg-white/6 transition-colors"
    >
      <span className="text-2xl leading-none">{sportEmoji(license.product?.sportType ?? "")}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{license.product?.title ?? "Plano de treino"}</p>
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-foreground/45 mt-0.5">
          <span>{sportLabel(license.product?.sportType ?? null)}</span>
          {license.author && (
            <>
              <span className="text-foreground/25">·</span>
              <span>{license.author.name}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatePill state={license.state} />
        <span className="hidden sm:inline text-xs font-medium text-foreground/60">{ctaLabel}</span>
        <IconArrowRight size={16} className="text-foreground/40" />
      </div>
    </Link>
  );
}

function ctaForState(state: MyTrainingLicenseSummary["state"]): string {
  switch (state) {
    case "not_started": return "Escolher data de início";
    case "in_progress": return "Abrir plano";
    case "paused": return "Retomar";
    case "completed": return "Ver resumo";
    case "refunded": return "Ver detalhes";
    case "expired": return "Ver detalhes";
    default: return "Abrir";
  }
}
