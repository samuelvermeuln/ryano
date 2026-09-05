# Ryvano Escola — Instruções para Agentes de Implementação

**Arquivo:** `implementation.md`  
**Finalidade:** permitir que Kiro, Hermes, Codex, Claude, ChatGPT ou qualquer outro agente/LLM implemente a feature de forma determinística e consiga retomar o trabalho após interrupções.

---

# 1. Arquivos normativos

A implementação é dirigida por três documentos, nesta ordem de autoridade:

```text
1. required.md
2. design.md
3. task-list.md
```

## `required.md`

Define **o que deve existir** e as regras de negócio.

Nunca alterar comportamento funcional contrariando este arquivo.

## `design.md`

Define **como a solução deve ser estruturada tecnicamente**:

- domínio;
- banco;
- relacionamentos;
- enums;
- eventos;
- endpoints;
- autorização;
- matching;
- compliance.

## `task-list.md`

Define **a ordem de execução**, dependências e o estado persistente de cada task.

---

# 2. Metadados da spec

Esta feature segue:

```json
{
  "specId": "3f6b8f2e-9a1d-4c7b-8e2a-6d5b4a9c7f10",
  "workflowType": "requirements-first",
  "specType": "feature"
}
```

---

# 3. Workflow obrigatório

Todo agente deve seguir:

```text
required.md
    ↓
design.md
    ↓
task-list.md
    ↓
inspecionar Git
    ↓
retomar [~] OU selecionar próxima [ ]
    ↓
marcar [~]
    ↓
implementar
    ↓
testar
    ↓
marcar [x]
    ↓
próxima task
```

---

# 4. Estados das tasks

```text
[ ] pendente
[~] em andamento
[x] concluída
[!] bloqueada
```

Nunca usar `[x]` para indicar “estou trabalhando”.

Isso é essencial para permitir retomada segura após perda de contexto, limite de tokens, limite de créditos ou troca de LLM.

---

# 5. Algoritmo para escolher a próxima task

O agente deve:

1. procurar task `[~]`;
2. se existir, continuar essa task;
3. se não existir, procurar task `[!]` e entender se ainda está bloqueada;
4. selecionar a primeira task `[ ]` por ordem do arquivo;
5. verificar todas as dependências;
6. iniciar somente se todas as dependências obrigatórias estiverem `[x]`;
7. marcar `[~]`;
8. persistir a alteração;
9. começar a modificar código.

---

# 6. Retomada após interrupção

Ao iniciar sessão nova:

```bash
git status
git diff
```

Depois pesquisar:

```text
[~]
```

em `task-list.md`.

Se houver uma task `[~]`:

- ela é a prioridade;
- ler as `Implementation Notes`;
- revisar o diff;
- revisar arquivos já modificados;
- executar os testes relacionados;
- completar o que falta;
- somente então marcar `[x]`.

---

# 7. Persistência de progresso

O progresso NÃO deve existir apenas na conversa da LLM.

O estado deve estar no repositório através de:

```text
task-list.md
```

Para tasks interrompidas, acrescentar:

```markdown
### Implementation Notes

- Estado atual: em andamento
- Arquivos alterados:
  - ...
- Implementado:
  - ...
- Falta:
  - ...
- Testes executados:
  - ...
- Observações:
  - ...
```

---

# 8. Regras de implementação

O agente deve:

- reutilizar padrões existentes da Ryvano;
- consultar documentação oficial quando necessário;
- respeitar arquitetura modular;
- preservar histórico temporal;
- preservar autoria;
- aplicar autorização no backend;
- usar `NormalizedActivity`;
- não acoplar Escola diretamente a Garmin/Strava;
- não mover histórico fisicamente entre escolas;
- não apagar histórico por desligamento;
- não substituir períodos anteriores;
- não implementar marketplace antes das tasks correspondentes;
- evitar refactors fora do escopo sem necessidade comprovada.

---

# 9. Antes de marcar uma task como concluída

Verificar:

```text
[ ] requisitos atendidos
[ ] design respeitado
[ ] dependências respeitadas
[ ] código compilando
[ ] lint passando
[ ] testes relevantes passando
[ ] autorização validada
[ ] migration testada, se houver
[ ] sem TODO bloqueador
[ ] task-list atualizado
```

Somente depois:

```text
[~] → [x]
```

---

# 10. Commits e PRs

Quando o ambiente permitir Git:

- preferir commits coerentes por task ou pequeno grupo de tasks;
- referenciar os IDs das tasks;
- não misturar fases sem necessidade.

Exemplo:

```text
feat(school): implement school foundation [T010-T018]
```

---

# 11. Mudança de design

Se durante a implementação for identificado que `design.md` precisa mudar:

1. não improvisar silenciosamente;
2. verificar `required.md`;
3. registrar a decisão;
4. atualizar `design.md`;
5. criar/atualizar ADR se relevante;
6. só então continuar.

`required.md` continua sendo a fonte superior de regras funcionais.

---

# 12. Conflito entre documentos

Prioridade:

```text
required.md > design.md > task-list.md > código existente da feature
```

Se houver conflito real com arquitetura global já existente da Ryvano:

- preservar requisitos;
- adaptar o design ao padrão real do projeto;
- documentar a adaptação.

---

# 13. Proibição de “marcar tudo como concluído”

Uma LLM não deve marcar uma task `[x]` apenas porque:

- criou arquivos;
- escreveu scaffolding;
- acredita que está correta;
- não teve tempo para testar.

`[x]` significa **Definition of Done atendida**.

---

# 14. Contexto mínimo para outra LLM

Uma nova LLM não precisa da conversa anterior.

Ela deve conseguir continuar apenas com:

```text
required.md
design.md
task-list.md
implementation.md
spec.json
código atual
git diff/status
```

Essa é uma exigência do projeto.

---

# 15. Instrução curta para iniciar uma implementação

Pode ser usada com qualquer agente:

> Leia `implementation.md`, depois `required.md`, `design.md` e `task-list.md`. Inspecione `git status` e `git diff`. Se existir uma task `[~]`, retome-a. Caso contrário, escolha a primeira task `[ ]` cujas dependências estejam `[x]`, altere-a para `[~]` antes de modificar código, implemente integralmente, execute os testes aplicáveis e somente então altere para `[x]`. Nunca pule dependências e nunca marque como concluída uma task parcialmente implementada.

---

**Fim do `implementation.md`.**
