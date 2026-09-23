#!/usr/bin/env bash
# Verifica a consistência do estado da spec.
#
# Por que existe: no spec anterior (ryvano-escola-spec), 8 tasks ficaram marcadas
# como pendentes por semanas depois de entregues. Um agente que confiasse naquele
# estado teria reimplementado trabalho que já existia. Rodar isto antes de commitar
# evita repetir o erro.
#
# Uso:  bash .kiro/specs/ryvano-jornada-escola/check-status.sh
# Saída: 0 = consistente | 1 = divergência encontrada

set -uo pipefail
cd "$(dirname "$0")"

TASKS="task-list.md"
STATUS="STATUS.md"
fail=0

note() { printf '%s\n' "$*"; }
bad()  { printf 'FALHA: %s\n' "$*"; fail=1; }

for f in "$TASKS" "$STATUS" requirements.md design.md spec.json; do
  [ -f "$f" ] || bad "arquivo ausente: $f"
done
[ "$fail" -eq 1 ] && exit 1

# grep -c ja imprime 0 quando nao ha match; o `|| echo 0` duplicaria a saida.
count() { grep -c "^## \[$1\]" "$TASKS" 2>/dev/null; }

done_n=$(count 'x')
prog_n=$(count '~')
todo_n=$(count ' ')
blk_n=$(count '!')
total=$((done_n + prog_n + todo_n + blk_n))

note "=== Contagem em $TASKS ==="
note "  [x] concluidas ..... $done_n"
note "  [~] em andamento ... $prog_n"
note "  [ ] pendentes ...... $todo_n"
note "  [!] bloqueadas ..... $blk_n"
note "  total .............. $total"
note ""

# 1. Mais de uma task em andamento dilui o foco e quebra a retomada.
if [ "$prog_n" -gt 1 ]; then
  bad "$prog_n tasks em [~]. O protocolo pede uma por vez."
  grep -n "^## \[~\]" "$TASKS"
fi

# 2. Task [~] sem Implementation Notes nao permite retomar.
if [ "$prog_n" -ge 1 ]; then
  note "Tasks em andamento:"
  grep -n "^## \[~\]" "$TASKS"
  grep -q "### Implementation Notes" "$TASKS" \
    || bad "task [~] sem bloco 'Implementation Notes' — a proxima sessao nao sabera onde retomar."
fi

# 3. Task [!] sem Blocker declarado.
if [ "$blk_n" -ge 1 ]; then
  note "Tasks bloqueadas:"
  grep -n "^## \[!\]" "$TASKS"
  grep -q "\*\*Blocker:\*\*" "$TASKS" \
    || bad "task [!] sem '**Blocker:**' descrevendo o impedimento."
fi

# 4. O total declarado no STATUS precisa bater com a contagem real.
if ! grep -q "Total geral: ${done_n}/${total} tasks" "$STATUS"; then
  bad "STATUS.md desatualizado: esperado 'Total geral: ${done_n}/${total} tasks'."
  grep -n "Total geral:" "$STATUS" || note "  (linha 'Total geral:' nao encontrada)"
fi

# 5. Dependencias precisam apontar para IDs que existem.
python3 - <<'PY'
import re, sys
txt = open('task-list.md').read()
ids = set(re.findall(r'^## \[.\] (T\d+b?) ', txt, re.M))
pat = re.findall(
    r'^## \[.\] (T\d+b?) .+?\n\n\*\*Tipo:\*\*.+?\n\*\*Prioridade:\*\*.+?\n\*\*Dependencias:\*\* (.+?)\n',
    txt, re.M | re.S)
bad = [(t, d) for t, deps in pat if deps.strip() not in ('—', '-')
       for d in deps.split() if d not in ids]
if bad:
    print("FALHA: dependencias apontando para IDs inexistentes:")
    for t, d in bad:
        print(f"  {t} -> {d}")
    sys.exit(1)
PY
[ $? -ne 0 ] && fail=1

# 6. Dependencia concluida antes da dependente (ordem logica).
python3 - <<'PY'
import re, sys
txt = open('task-list.md').read()
st = dict((m[1], m[0]) for m in re.findall(r'^## \[(.)\] (T\d+b?) ', txt, re.M))
pat = re.findall(
    r'^## \[.\] (T\d+b?) .+?\n\n\*\*Tipo:\*\*.+?\n\*\*Prioridade:\*\*.+?\n\*\*Dependencias:\*\* (.+?)\n',
    txt, re.M | re.S)
bad = [(t, d, st.get(d)) for t, deps in pat if st.get(t) == 'x'
       and deps.strip() not in ('—', '-')
       for d in deps.split() if st.get(d) != 'x']
if bad:
    print("FALHA: task [x] com dependencia nao concluida:")
    for t, d, s in bad:
        print(f"  {t} [x] depende de {d} [{s}]")
    sys.exit(1)
PY
[ $? -ne 0 ] && fail=1

note ""
if [ "$fail" -eq 0 ]; then
  note "OK — estado consistente."
else
  note "Corrija os itens acima antes de commitar."
fi
exit "$fail"
