# Credenciais dos usuários E2E

> Gerado automaticamente pelos testes E2E. Todos os usuários usam senha `Teste123!`

## Escolas

| Papel | Nome | E-mail | Senha |
|---|---|---|---|
| Dono Escola Alpha | Dono Escola Alpha | `owner.alpha@ryvano-e2e.test` | `Teste123!` |
| Dono Escola Beta | Dono Escola Beta | `owner.beta@ryvano-e2e.test` | `Teste123!` |

### Escola Alpha de Natação
- Modalidades: Natação, Corrida, Ciclismo
- Política: REQUIRE_APPROVAL
- CNPJ: 12.345.678/0001-91

### Escola Beta de Ciclismo
- Modalidades: Ciclismo, Corrida, Natação
- Política: AUTO_APPROVE
- CNPJ: 98.765.432/0001-00

---

## Professores

| Nome | E-mail | Senha | Escola |
|---|---|---|---|
| Prof. Carlos Mendes | `prof.carlos@ryvano-e2e.test` | `Teste123!` | Escola Alpha ✅ |
| Prof. Ana Lima | `prof.ana@ryvano-e2e.test` | `Teste123!` | Escola Alpha ✅ |
| Prof. Ricardo Souza | `prof.ricardo@ryvano-e2e.test` | `Teste123!` | Independente (sem escola) |

---

## Alunos / Atletas

| Nome | E-mail | Senha | Escola |
|---|---|---|---|
| Aluno João Silva | `aluno.joao@ryvano-e2e.test` | `Teste123!` | Escola Alpha |
| Aluna Maria Oliveira | `aluna.maria@ryvano-e2e.test` | `Teste123!` | Escola Alpha |
| Aluno Pedro Santos | `aluno.pedro@ryvano-e2e.test` | `Teste123!` | Escola Alpha |
| Aluna Fernanda Costa | `aluna.fernanda@ryvano-e2e.test` | `Teste123!` | Escola Alpha |
| Aluno Lucas Rocha | `aluno.lucas@ryvano-e2e.test` | `Teste123!` | Escola Alpha |

---

## Treinos prescritos (por aluno)

Cada aluno recebeu 3 prescrições:

| Modalidade | Sport Type | Duração | Distância |
|---|---|---|---|
| Natação | `swim` | 45 min | 2 km |
| Corrida | `run` | 60 min | 10 km |
| Ciclismo | `bike` | 90 min | 40 km |

---

## URLs importantes

| Rota | Descrição |
|---|---|
| `/entrar` | Login |
| `/entrar?modo=cadastro` | Cadastro |
| `/onboarding` | Completar perfil |
| `/professor` | Painel do professor |
| `/escola` | Painel da escola |
| `/escola/criar` | Criar nova escola |
| `/professor/buscar-escola` | Solicitar vínculo com escola |
| `/escola/buscar` | Buscar escola (aluno) |
| `/app/treinos` | Calendário de treinos do atleta |
| `/app/treinos/solicitar` | Solicitar treino |
| `/professor/<schoolId>/treinos` | Gerenciar pedidos (professor) |
| `/escola/<schoolId>/solicitacoes` | Aprovar membros (dono) |
