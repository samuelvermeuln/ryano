# Matriz de acesso por perfil

Medida por requisição HTTP real com sessão autenticada em 2026-09-23.
Não é derivada de leitura de código — é o comportamento observado.
Regenerar com `scripts/audit-access.sh`.

Contas e2e: `{owner.alpha,prof.carlos,aluno.joao}@ryvano-e2e.test` / `Teste123!`
Escola Alpha de Natação: `cmue80z3v003kod8dpb6yt51b` (5 atletas, 2 professores)

Legenda: `200` renderiza · `307` redirect HTTP · `200→X` meta-refresh para X · `404` não existe

| Rota | OWNER | PROFESSOR | ATLETA |
|---|---|---|---|
| `/app/dashboard` | `200→/escola/{id}` | `200` | `200` |
| `/app/atividades` | `200` | `200` | `200` |
| `/app/treinos` | `200` | `200` | `200` |
| `/app/relatorios` | `200→/app/perfil#notificacoes` | idem | idem |
| `/app/integracoes` | `200` | `200` | `200` |
| `/app/perfil` | `200` | `200` | `200` |
| `/app/seguranca` | `200` | `200` | `200` |
| `/app/escola` | `200` | `200` | `200` |
| `/app/professor` | `200` | `200` | `200` |
| `/atleta/semana` | `200` | `200` | `200` |
| `/atleta/{id}` | `307` | `307` | `200` |
| `/atleta/{id}/calendario` | `307` | `307` | `200` |
| `/atleta/{id}/historico` | `307` | `307` | `200` |
| `/escola` | `307` | `307` | `307` |
| `/escola/{id}` | `200` | `307` | `307` |
| `/escola/{id}/atletas` | `200` | `307` | `307` |
| `/escola/{id}/professores` | `200` | `307` | `307` |
| `/escola/{id}/membros` | `200` | `307` | `307` |
| `/escola/{id}/solicitacoes` | `200` | `307` | `307` |
| `/escola/{id}/convites` | `200` | `307` | `307` |
| `/escola/{id}/turmas` | `404` | `404` | `404` |
| `/escola/buscar` | `200` | `200` | `200` |
| `/escola/criar` | `200` | `200` | `200` |
| `/professor/{id}` | `307` | `200` | `307` |
| `/professor/{id}/atletas` | `307` | `200` | `307` |
| `/professor/{id}/treinos` | `307` | `200` | `307` |
| `/professor/{id}/turmas` | `307` | `200` | `307` |
| `/professor/independente` | `307` | `200` | `307` |
| `/professor/buscar-escola` | `307` | `200` | `307` |
| `/admin*` (todas) | `307` | `307` | `307` |

## Leitura da matriz

**Isolamento entre áreas funciona.** Nenhum perfil alcança a área de outro:
professor não abre `/escola/*`, dono não abre `/professor/*`, ninguém sem
`role=ADMIN` abre `/admin/*`. O guard vive no `layout.tsx` de cada área.

**`/app/*` é compartilhado por desenho.** Todo usuário onboarded acessa —
é o espaço pessoal (atividades do próprio relógio, perfil, segurança).
Um dono de escola tem conta pessoal como qualquer um. Isso não é falha
de autorização; cada página filtra pelos dados do próprio usuário.

**`/escola` e `/professor` sem ID são dispatchers**, sempre 307. Resolvem
a escola do usuário e redirecionam. Para OWNER, `/escola` → `/escola/{id}`.

## Armadilhas de nomenclatura

Três pares distintos que parecem iguais:

| Confusão | São coisas diferentes |
|---|---|
| `/app/escola` vs `/escola` | O primeiro é **descoberta** (atleta procura escola para entrar). O segundo é **administração**. |
| `User.role = ADMIN` vs `SchoolRole.ADMIN` | O primeiro é admin **da plataforma** (`/admin/*`). O segundo é admin **de uma escola** (`/escola/{id}/*`). Não se implicam. |
| `/professor/{id}/turmas` vs `/escola/{id}/turmas` | O do professor existe. O da escola é 404. |

## Fronteiras de dados

**Biometria do atleta exige consentimento.** Escola e professor não leem
prontidão, sono, HRV ou Body Battery sem `HistoryAccessGrant` não-revogado,
validado por `CanReadAthleteHistory`. Ver `docs/escola-permission-rules.md` §7.
O consentimento é do atleta — nenhum admin concede em nome dele.

O que a escola vê sem consentimento: execuções de treinos que **ela mesma
prescreveu** (`WorkoutExecution` via `assignment.schoolId`), com origem e
aderência. É dado que o atleta compartilhou ao executar a prescrição.

**Membership ENDED ainda lê histórico.** Em `/atleta/[schoolId]`, o layout
aceita membership encerrada para as telas de histórico — atleta que saiu
da escola não perde o passado.

## Divergência conhecida: dois caminhos de landing

Dois mecanismos decidem para onde o usuário vai, com regras diferentes:

| | `resolveSmartLandingPath()` | guard em `/app/dashboard` |
|---|---|---|
| Onde | `server/auth-guards.ts`, usado em `/entrar` | `app/app/dashboard/page.tsx` |
| Quando | Visita `/entrar` já autenticado | Acessa o dashboard diretamente |
| Destino | `/escola` (sem ID) | `/escola/{id}` |
| Checa vínculo de atleta? | **Não** | **Sim** — quem é atleta em alguma escola não é redirecionado |
| Professor | → `/professor` se tem `CoachProfile` | não trata |

São complementares (cobrem entradas diferentes), mas as regras não são
idênticas. Ao mexer em qualquer um, conferir o outro.
