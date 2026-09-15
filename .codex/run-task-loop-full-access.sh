#!/usr/bin/env bash
set -uo pipefail

# Uso:
#   ./.codex/run-task-loop.sh 20
#   ./.codex/run-task-loop.sh all
# Executa até N novas tasks serem marcadas [x], ou até o backlog terminar.
# Use "all" para concluir todo o backlog restante.
#
# ATENÇÃO: usa --dangerously-bypass-approvals-and-sandbox para não pedir confirmações.
# Execute somente em um repositório confiável.
#
# A persistência NÃO depende de um único turno do Codex:
# se o Codex devolver o controle cedo, este script inicia outra execução
# e manda retomar do checkpoint.

TARGET_ARG="${1:-20}"
STATE=".codex/task-loop-state.json"
SPEC_DIR=".kiro/specs/ryvano-escola-spec"
DEFAULT_TASK_LIST="$SPEC_DIR/task-list.md"
LOG_DIR=".codex/loop-logs"
mkdir -p "$LOG_DIR"

if [[ "$TARGET_ARG" != "all" ]] && { ! [[ "$TARGET_ARG" =~ ^[0-9]+$ ]] || (( TARGET_ARG < 1 )); }; then
  echo "Uso: $0 <quantidade-de-tasks|all>"
  exit 2
fi

task_list_from_state() {
  python3 - "$STATE" "$DEFAULT_TASK_LIST" <<'PY'
import json, sys
from pathlib import Path
state = Path(sys.argv[1])
default = sys.argv[2]
try:
    data = json.loads(state.read_text(encoding="utf-8"))
    print(data.get("task_list_path") or default)
except Exception:
    print(default)
PY
}

TASK_LIST="$(task_list_from_state)"

if [[ ! -d "$SPEC_DIR" ]]; then
  echo "ERRO: pasta da spec não encontrada: $SPEC_DIR"
  exit 2
fi

# Para este loop, sempre force o backlog da escola como fonte de verdade.
TASK_LIST="$DEFAULT_TASK_LIST"

if [[ ! -f "$TASK_LIST" ]]; then
  echo "ERRO: task list não encontrada: $TASK_LIST"
  exit 2
fi

count_done() {
  grep -Ec '^## \[x\] T[0-9]+' "$TASK_LIST" 2>/dev/null || true
}

count_pending() {
  grep -Ec '^## \[ \] T[0-9]+' "$TASK_LIST" 2>/dev/null || true
}

resume_after_epoch() {
  python3 - "$STATE" <<'PY'
import json, sys
from datetime import datetime
from pathlib import Path

p = Path(sys.argv[1])
if not p.exists():
    print("")
    raise SystemExit

try:
    data = json.loads(p.read_text(encoding="utf-8"))
    value = data.get("resume_after")
    if not value:
        print("")
        raise SystemExit
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    print(int(dt.timestamp()))
except Exception:
    print("")
PY
}

loop_status() {
  python3 - "$STATE" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
try:
    d = json.loads(p.read_text(encoding="utf-8"))
    print(d.get("loop_status") or "")
except Exception:
    print("")
PY
}

START_DONE="$(count_done)"
START_PENDING="$(count_pending)"

if (( START_PENDING == 0 )); then
  echo "✓ Backlog já está concluído."
  exit 0
fi

if [[ "$TARGET_ARG" == "all" ]]; then
  TARGET="$START_PENDING"
else
  TARGET="$TARGET_ARG"
  if (( TARGET > START_PENDING )); then
    TARGET="$START_PENDING"
  fi
fi

GOAL=$((START_DONE + TARGET))
STAGNANT=0
ROUND=0

echo "Ryvano task loop"
echo "Task list : $TASK_LIST"
echo "Concluídas: $START_DONE"
echo "Pendentes  : $START_PENDING"
echo "Meta       : +$TARGET tasks (total [x] = $GOAL)"
echo

while true; do
  DONE_NOW="$(count_done)"
  PENDING_NOW="$(count_pending)"
  COMPLETED_THIS_RUN=$((DONE_NOW - START_DONE))

  if (( DONE_NOW >= GOAL )); then
    echo "✓ Meta atingida: $COMPLETED_THIS_RUN novas tasks concluídas."
    exit 0
  fi

  if (( PENDING_NOW == 0 )); then
    echo "✓ Backlog concluído. Novas tasks concluídas: $COMPLETED_THIS_RUN."
    exit 0
  fi

  STATUS="$(loop_status)"
  case "$STATUS" in
    user_blocked|USER_BLOCKED)
      echo "⛔ Loop parado: precisa de informação/decisão do usuário."
      exit 3
      ;;
    hard_failure|HARD_FAILURE)
      echo "⛔ Loop parado: HARD_FAILURE registrado no checkpoint."
      exit 4
      ;;
    backlog_done|BACKLOG_DONE)
      echo "✓ BACKLOG_DONE registrado."
      exit 0
      ;;
  esac

  # Se o checkpoint tem uma retomada futura de quota, espere localmente sem LLM.
  RESUME_EPOCH="$(resume_after_epoch)"
  if [[ -n "$RESUME_EPOCH" ]]; then
    NOW_EPOCH="$(date +%s)"
    if (( RESUME_EPOCH > NOW_EPOCH )); then
      WAIT_SECS=$((RESUME_EPOCH - NOW_EPOCH))
      echo "⏸ Quota pausada. Aguardando ${WAIT_SECS}s até resume_after..."
      sleep "$WAIT_SECS"
    fi
  fi

  ROUND=$((ROUND + 1))
  LOG_FILE="$LOG_DIR/round-$(printf '%04d' "$ROUND").log"

  PROMPT=$(cat <<EOF
RETOME O LOOP AUTÔNOMO DO RYVANO A PARTIR DO CHECKPOINT EXISTENTE.

Meta externa desta execução:
- início: $START_DONE tasks marcadas [x]
- meta total: $GOAL tasks marcadas [x]
- já concluídas nesta execução: $COMPLETED_THIS_RUN de $TARGET
- pendentes agora: $PENDING_NOW

REGRAS OBRIGATÓRIAS:
1. Não responda apenas com status.
2. Leia .codex/task-loop-state.json e reconcilie qualquer agente/alteração pendente.
3. A fonte de verdade é .kiro/specs/ryvano-escola-spec/task-list.md e toda a documentação necessária está em .kiro/specs/ryvano-escola-spec/.
4. Execute UMA task por vez.
5. Use somente os agentes nomeados: context, explorer, developer, tester, reviewer.
6. Nunca use worker/default para implementação.
7. Nunca agrupe várias tasks na mesma chamada do developer.
8. Somente developer pode implementar código.
9. Conclua developer -> testes -> revisão necessária -> marque [x] -> checkpoint -> próxima.
10. Continue trabalhando enquanto o runtime permitir.
11. Se este turno terminar por decisão do runtime, NÃO altere a meta; o wrapper externo iniciará outro turno automaticamente.
12. Só registre USER_BLOCKED/HARD_FAILURE quando for realmente impossível continuar automaticamente.
13. Se houver quota, salve resume_after e encerre recuperavelmente; o wrapper fará a espera e retomada.
14. Não peça confirmação ao usuário entre tarefas.

COMECE AGORA pelo estado existente; não recomece o backlog.
EOF
)

  BEFORE="$DONE_NOW"
  echo "▶ rodada $ROUND | progresso $COMPLETED_THIS_RUN/$TARGET | concluídas=$DONE_NOW pendentes=$PENDING_NOW"

  set +e
  caveman codex exec --dangerously-bypass-approvals-and-sandbox "$PROMPT" 2>&1 | tee "$LOG_FILE"
  RC=${PIPESTATUS[0]}
  set -e

  AFTER="$(count_done)"

  if (( AFTER > BEFORE )); then
    GAIN=$((AFTER - BEFORE))
    STAGNANT=0
    echo "✓ rodada $ROUND avançou +$GAIN task(s)."
  else
    STAGNANT=$((STAGNANT + 1))
    echo "⚠ rodada $ROUND terminou sem nova task marcada [x]."

    # Se houve quota e não existe resume_after, use pausa conservadora para
    # evitar gastar chamadas repetidas em polling.
    if grep -Eqi 'usage limit|quota[_ ]?exceeded|credits exhausted|rate limit|insufficient_quota|provider_quota' "$LOG_FILE"; then
      echo "⏸ Limite/quota detectado sem resume_after utilizável; aguardando 30 minutos sem LLM."
      sleep 1800
      STAGNANT=0
      continue
    fi

    # Evita loop infinito em bug real sem progresso.
    if (( STAGNANT >= 5 )); then
      echo "⛔ 5 rodadas consecutivas sem progresso. Verifique o último log:"
      echo "   $LOG_FILE"
      exit 5
    fi
  fi

  if (( RC != 0 )); then
    echo "⚠ Codex retornou código $RC; o loop tentará retomar pelo checkpoint."
  fi

  sleep 2
done
