/**
 * SAM-80 — `/admin/indicadores` (§24.1): seven indicators of use and
 * reliability, each with its definition, numerator, denominator and the
 * period. Aggregates only — no coach or athlete is named, nothing ranks
 * people. Platform ADMIN only (the layout and this page both guard it).
 */
import { SectionCard } from "@/components/section-card";
import { FIELD_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { loadProductIndicators } from "@/modules/school/application/product-indicators";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const DAYS = [30, 90, 180, 365] as const;

export default async function AdminIndicatorsPage({ searchParams }: { searchParams: Promise<{ dias?: string; escola?: string }> }) {
  await requireAdmin();
  const { dias, escola } = await searchParams;
  const days = DAYS.includes(Number(dias) as (typeof DAYS)[number]) ? Number(dias) : 90;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const schoolId = escola && escola !== "" ? escola : null;
  const [schools, report] = await Promise.all([
    prisma.school.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadProductIndicators(prisma, { from, to }, schoolId),
  ]);
  const fmt = (date: Date) => date.toLocaleDateString("pt-BR");

  return (
    <div className="space-y-6">
      <SectionCard title="Indicadores do produto" description="Uso e confiabilidade da plataforma (§24.1). Agregados por período; sem ranking de professores ou alunos e sem nomes.">
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get" data-testid="indicators-filter">
          <label className="grid gap-1">Período
            <select name="dias" defaultValue={String(days)} className={FIELD_CLASS} aria-label="Período em dias">
              {DAYS.map((value) => <option key={value} value={value}>últimos {value} dias</option>)}
            </select>
          </label>
          <label className="grid gap-1">Escola (recorte do admin)
            <select name="escola" defaultValue={schoolId ?? ""} className={FIELD_CLASS} aria-label="Escola">
              <option value="">Toda a plataforma</option>
              {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </label>
          <button type="submit" className={SECONDARY_ACTION_CLASS}>Aplicar</button>
          <span className="text-xs text-foreground/55" data-testid="indicators-period">{fmt(from)} → {fmt(to)}</span>
        </form>
      </SectionCard>
      <div className="grid gap-4 xl:grid-cols-2">
        {report.indicators.map((indicator) => (
          <SectionCard key={indicator.key} title={indicator.title} description={indicator.definition}>
            <p className="text-lg font-semibold" data-testid={`indicator-${indicator.key}`}>{indicator.value}</p>
            <dl className="mt-2 grid gap-1 text-xs text-foreground/60">
              <div><dt className="inline font-medium">Numerador: </dt><dd className="inline">{indicator.numerator}</dd></div>
              <div><dt className="inline font-medium">Denominador: </dt><dd className="inline">{indicator.denominator}</dd></div>
              <div><dt className="inline font-medium">Período: </dt><dd className="inline">{fmt(from)} a {fmt(to)}{schoolId ? " · escola selecionada" : " · toda a plataforma"}</dd></div>
            </dl>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}