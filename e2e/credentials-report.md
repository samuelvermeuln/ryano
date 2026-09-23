# Relatório de Credenciais E2E — Validação Manual

> Suite Playwright 31/31 ✅ — Servidor: `http://localhost:3000`  
> Gerado em: 2026-09-16 | Senha universal: `Teste123!`

---

## 🏫 Escolas criadas no banco

### Escola Alpha de Natação
| Campo | Valor |
|---|---|
| **School ID** | `cmue80z3v003kod8dpb6yt51b` |
| **URL** | http://localhost:3000/escola/cmue80z3v003kod8dpb6yt51b |
| **Dono (e-mail)** | `owner.alpha@ryvano-e2e.test` |
| **Senha** | `Teste123!` |
| **Modalidades** | Natação, Corrida, Ciclismo |
| **Política** | REQUIRE_APPROVAL |
| **CNPJ** | 12.345.678/0001-91 |

### Escola Beta de Ciclismo
| Campo | Valor |
|---|---|
| **School ID** | `cmue81gr0003ood8dsyppr1h2` |
| **URL** | http://localhost:3000/escola/cmue81gr0003ood8dsyppr1h2 |
| **Dono (e-mail)** | `owner.beta@ryvano-e2e.test` |
| **Senha** | `Teste123!` |
| **Modalidades** | Ciclismo, Corrida, Natação |
| **Política** | AUTO_APPROVE |
| **CNPJ** | 98.765.432/0001-00 |

---

## 👨🏫 Professores

| Nome | E-mail | Senha | Escola | Status |
|---|---|---|---|---|
| Carlos Mendes | `prof.carlos@ryvano-e2e.test` | `Teste123!` | Escola Alpha | ACTIVE ✅ |
| Ana Lima | `prof.ana@ryvano-e2e.test` | `Teste123!` | Escola Alpha | ACTIVE ✅ |
| Ricardo Souza | `prof.ricardo@ryvano-e2e.test` | `Teste123!` | Independente | — |

---

## 🏃 Atletas / Alunos (todos na Escola Alpha)

| Nome | E-mail | Senha | Status na Escola |
|---|---|---|---|
| João Silva | `aluno.joao@ryvano-e2e.test` | `Teste123!` | ACTIVE ✅ |
| Maria Oliveira | `aluna.maria@ryvano-e2e.test` | `Teste123!` | ACTIVE ✅ |
| Pedro Santos | `aluno.pedro@ryvano-e2e.test` | `Teste123!` | ACTIVE ✅ |
| Fernanda Costa | `aluna.fernanda@ryvano-e2e.test` | `Teste123!` | ACTIVE ✅ |
| Lucas Rocha | `aluno.lucas@ryvano-e2e.test` | `Teste123!` | ACTIVE ✅ |

---

## 🏋️ Treinos prescritos (15 no total — 3 por atleta)

Prof. Carlos prescreveu 1 treino de cada modalidade para cada atleta via painel `/professor/<schoolId>/treinos`.

| Modalidade | Sport Type | Título |
|---|---|---|
| Natação | `swim` | Treino de swim |
| Corrida | `run` | Treino de run |
| Ciclismo | `bike` | Treino de bike |

---

## 🔗 URLs de validação manual

| Rota | Descrição | Usuário recomendado |
|---|---|---|
| `/entrar` | Login | qualquer |
| `/app/dashboard` | Dashboard do atleta | aluno.joao |
| `/app/treinos` | Calendário de treinos | aluno.joao |
| `/professor` | Painel do professor | prof.carlos |
| `/professor/cmue80z3v003kod8dpb6yt51b` | Dashboard da escola (professor) | prof.carlos |
| `/professor/cmue80z3v003kod8dpb6yt51b/treinos` | Gerenciar treinos (professor) | prof.carlos |
| `/escola/cmue80z3v003kod8dpb6yt51b` | Painel da Escola Alpha | owner.alpha |
| `/escola/cmue80z3v003kod8dpb6yt51b/solicitacoes` | Solicitações pendentes | owner.alpha |
| `/escola/cmue80z3v003kod8dpb6yt51b/membros` | Membros da escola | owner.alpha |

---

## 🐛 Bug corrigido durante os testes

**`createSchoolDtoSchema` — ZodError ao criar escola**

- `modules/school/domain/school.ts`: `createSchoolDtoSchema` omitia `cnpjEncrypted` e `cnpjHash` mas o `action.ts` os passava → `z.strictObject` rejeitava como "Unrecognized keys".
- Fix: removido o omit de `cnpjEncrypted` e `cnpjHash` do `createSchoolDtoSchema`.
