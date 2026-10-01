# Escola ADR-007 — Carga de treino por frequência cardíaca (hrTSS)

## Status

Aceito (SAM-20, 2026-10-01).

## Contexto

O produto guarda apenas o resumo das atividades (sem séries por segundo) e potência só existe em parte das modalidades. Um modelo de carga precisa de uma referência fisiológica do atleta; sem ela, qualquer número é um nome sem metodologia. A ficha técnica (SAM-18) passou a registrar FC de repouso, de limiar e máxima — exatamente os três parâmetros do hrTSS.

## Decisão

Estimar a carga de cada sessão pela aproximação de TSS por frequência cardíaca (TrainingPeaks "hrTSS", na leitura do Intervals.icu), paráfrase:

- `%HRR(x) = (x − repouso) / (máx − repouso)` (reserva de FC, Karvonen);
- `IF = %HRR(FC média da sessão) ÷ %HRR(FC de limiar)`;
- `hrTSS = horas × IF² × 100` — uma hora na FC de limiar vale 100, por construção.

Exemplo numérico (coberto por teste): repouso 50, limiar 170, máx 190 → `%HRR(170) = 0,857`; 60 min a 160 bpm → `%HRR = 0,786`, `IF = 0,917`, `hrTSS ≈ 84`.

Regras:

- Só é calculada quando os três parâmetros existem e são coerentes (repouso < limiar ≤ máx); caso contrário a tela não mostra o número nem um zero.
- Sessões sem FC média não contribuem (não são estimadas por outro meio).
- **Sem CTL/ATL/TSB**: o modelo de forma crônica/aguda exige série diária contínua mais longa que as janelas exibidas; a lacuna fica declarada na tela.
- Implementação: `modules/school/domain/training-load.ts`; agregação semanal e por janela em `modules/school/domain/athlete-analysis.ts`.

## Consequências

A carga muda quando os limiares da ficha mudam — por isso a ficha mantém histórico de parâmetros (SAM-18). A análise mostra a carga da janela e a da janela anterior, nunca uma tendência de forma.

## Referências

- `architecture/adr/school/ADR-006-sport-compliance.md`
- `modules/school/domain/training-load.ts`, `tests/athlete-analysis.test.ts`
