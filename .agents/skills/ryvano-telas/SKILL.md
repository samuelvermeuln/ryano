---
name: ryvano-telas
description: "Esta skill deve ser usada quando o usuário perguntar sobre telas, rotas, perfis ou permissões do Ryvano — \"o que o dono da escola vê\", \"quais telas existem\", \"essa rota está protegida?\", \"por que o atleta não acessa X\", \"auditar as telas\", \"varrer o sistema\", \"quais links estão quebrados\", \"o que aparece para o professor\" — ou antes de criar/alterar qualquer página em app/. Fornece o mapa das 53 telas, a matriz de acesso por perfil medida por HTTP real, e scripts de auditoria."
---

# Telas, perfis e permissões do Ryvano

O Ryvano tem 53 páginas divididas em 5 áreas, cada uma com guard próprio no
`layout.tsx`. Esta skill fornece o mapa verificado e ferramentas para reauditar
em vez de confiar em documentação que envelhece.

## Regra central: medir, não presumir

Documentação de tela apodrece a cada commit. **Sempre reexecutar os scripts
antes de afirmar qualquer coisa sobre o estado atual.** Os arquivos em
`references/` são retratos datados, úteis como ponto de partida e para explicar
o *porquê* — não como verdade corrente sobre o *o quê*.

## Fluxo de trabalho

### 1. Auditoria estática (sempre primeiro, não precisa de servidor)

```bash
bash .agents/skills/ryvano-telas/scripts/audit-routes.sh
```

Reporta: inventário (páginas/APIs/models), **pastas de rota vazias**,
**links de navegação que apontam para página inexistente**, guard de cada
área, e páginas sem guard herdado.

Interpretar a saída:
- `[VAZIA] app/.../x` + `[QUEBRADO] /.../x` na mesma execução = menu linka
  rota não implementada. É 404 para o usuário final.
- Linha `PUBLICA` = página sem nenhum guard. Conferir se é intencional
  (`/entrar`, `/cadastro`, `/termos`, `/privacidade`, recuperação de senha
  e a home são legitimamente públicas; qualquer outra é suspeita).
- `guard na propria pagina` = protegida, mas fora do layout da área.

### 2. Auditoria dinâmica (exige `pnpm dev` + seed e2e)

```bash
bash .agents/skills/ryvano-telas/scripts/audit-access.sh
```

Loga como dono, professor e atleta e requisita cada rota, produzindo a matriz
perfil × rota. Detecta regressão de autorização que leitura de código não pega.

**Armadilha do Next dev:** redirect de Server Component não sai como 307 —
sai como HTTP 200 com `<meta id="__next-page-redirect" http-equiv="refresh">`.
`curl -w "%{redirect_url}"` mostra vazio e parece que não redirecionou. O
script já trata isso; ao investigar manualmente, buscar a meta tag no corpo.

**Um 200 não prova que a tela está certa.** Prova que respondeu. Para validar
conteúdo, inspecionar o corpo ou usar o navegador.

### 3. Consultar o contexto

Depois de medir, ler o reference da área tocada:

- **`references/screen-map.md`** — as 53 telas por área, o que cada uma mostra,
  parâmetros de querystring, guard aplicado.
- **`references/access-matrix.md`** — matriz perfil × rota medida, fronteiras
  de dados (consentimento de biometria), e as armadilhas de nomenclatura.

## Armadilhas que já causaram bug

Três pares de nomes parecidos que significam coisas diferentes:

| Confusão | Realidade |
|---|---|
| `/app/escola` vs `/escola` | Descoberta (atleta procura escola) vs administração (dono gerencia). |
| `User.role = ADMIN` vs `SchoolRole.ADMIN` | Admin da **plataforma** (`/admin/*`) vs admin de **uma escola**. Não se implicam. |
| `/professor/{id}/turmas` vs `/escola/{id}/turmas` | O do professor existe; o da escola é 404. |

Duas fronteiras de dados que não podem ser cruzadas:

- **Biometria exige consentimento.** Escola e professor não leem prontidão,
  sono, HRV ou Body Battery sem `HistoryAccessGrant` não-revogado, validado por
  `CanReadAthleteHistory` (`docs/escola-permission-rules.md` §7). O que a escola
  vê sem consentimento: execuções de treinos que **ela mesma prescreveu**.
- **A escola não tem relógio.** Widgets de wearable pertencem a `/app/*`
  (espaço pessoal). Nunca adicionar prontidão/sono/Body Battery em `/escola/*`
  — renderiza vazio para sempre e vaza dado pessoal sem base legal.

## Antes de criar ou alterar uma tela

1. Rodar `audit-routes.sh` — confirmar que a rota não existe já com outro nome.
2. Identificar a área e ler seu guard: o `layout.tsx` da área **é** a fronteira
   de segurança; não reimplementar autorização na página.
3. Conferir se o menu que vai linkar a tela existe (`app/app/layout.tsx` para
   `/app/*`, o layout da área para as demais).
4. Após implementar, rodar `audit-access.sh` e conferir que **cada perfil que
   não deveria ver a tela recebe 307**.
5. Criar a pasta da rota **somente** junto com o `page.tsx`. Pasta vazia com
   link no menu = 404 em produção.

## Delegar a um especialista

Para trabalho profundo em uma área, usar o agente correspondente em
`.agents/agents/`: `ryvano-atleta`, `ryvano-professor`, `ryvano-escola`,
`ryvano-admin`, `ryvano-auth`. Cada um conhece os models, invariantes e
casos de borda da sua área.

## Estado conhecido (2026-09-23)

Achados da última varredura completa, a reconfirmar a cada uso:

- `/escola/[schoolId]/turmas` — **404**, pasta vazia, mas linkada no menu
  lateral da escola. Único link quebrado do sistema.
- `/app/relatorios` — não é tela; redireciona para `/app/perfil#notificacoes`
  em todos os perfis.
- `resolveSmartLandingPath()` (em `/entrar`) e o guard de `/app/dashboard`
  decidem landing com regras **diferentes** — o primeiro manda para `/escola`
  sem ID e não checa vínculo de atleta; o segundo manda para `/escola/{id}` e
  checa. Mexer em um exige conferir o outro. Detalhes em `access-matrix.md`.
