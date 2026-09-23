#!/usr/bin/env bash
# Matriz perfil x rota por requisicao HTTP real. Exige dev server e seed e2e.
#   pnpm dev            (outro terminal)
#   bash .agents/skills/ryvano-telas/scripts/audit-access.sh [schoolId]
#
# Next dev NAO emite 307 em redirect de Server Component: injeta meta-refresh
# com HTTP 200. Por isso o destino e extraido do corpo, nao do header Location.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

BASE="${BASE_URL:-http://localhost:3000}"
SCHOOL="${1:-cmue80z3v003kod8dpb6yt51b}"
PASS="${E2E_PASSWORD:-Teste123!}"
PROFILES=("owner.alpha" "prof.carlos" "aluno.joao")

if ! curl -sf -o /dev/null "$BASE/entrar"; then
  echo "ERRO: servidor nao responde em $BASE. Rode 'pnpm dev'." >&2
  exit 1
fi

for u in "${PROFILES[@]}"; do
  code=$(curl -s -c "/tmp/ryv_$u.txt" -X POST "$BASE/api/e2e/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$u@ryvano-e2e.test\",\"password\":\"$PASS\"}" \
    -o /dev/null -w "%{http_code}")
  if [ "$code" != "200" ]; then
    echo "ERRO: login de $u falhou ($code). Rode 'pnpm db:seed'." >&2
    exit 1
  fi
done

probe() {
  local body code dest
  body=$(curl -s -b "$1" -w $'\n__CODE__%{http_code}' "$BASE$2")
  code=$(printf '%s' "$body" | tail -1 | sed 's/__CODE__//')
  dest=$(printf '%s' "$body" | grep -oE '__next-page-redirect[^>]*url=[^"]*' | sed 's/.*url=//')
  [ -n "$dest" ] && echo "$code->$dest" || echo "$code"
}

ROUTES=(
  "/app/dashboard" "/app/atividades" "/app/treinos" "/app/relatorios"
  "/app/integracoes" "/app/perfil" "/app/seguranca" "/app/escola" "/app/professor"
  "/atleta/semana" "/atleta/$SCHOOL" "/atleta/$SCHOOL/calendario" "/atleta/$SCHOOL/historico"
  "/escola" "/escola/$SCHOOL" "/escola/$SCHOOL/atletas" "/escola/$SCHOOL/professores"
  "/escola/$SCHOOL/membros" "/escola/$SCHOOL/solicitacoes" "/escola/$SCHOOL/convites"
  "/escola/$SCHOOL/turmas" "/escola/buscar" "/escola/criar"
  "/professor" "/professor/$SCHOOL" "/professor/$SCHOOL/atletas" "/professor/$SCHOOL/treinos"
  "/professor/$SCHOOL/turmas" "/professor/independente" "/professor/buscar-escola"
  "/admin" "/admin/escolas" "/admin/usuarios" "/admin/integracoes" "/admin/whatsapp"
)

printf "%-40s | %-24s | %-14s | %s\n" "ROTA" "OWNER" "PROFESSOR" "ATLETA"
printf '%.0s-' {1..104}; echo
for r in "${ROUTES[@]}"; do
  printf "%-40s | %-24s | %-14s | %s\n" "${r//$SCHOOL/\{id\}}" \
    "$(probe "/tmp/ryv_owner.alpha.txt" "$r")" \
    "$(probe "/tmp/ryv_prof.carlos.txt" "$r")" \
    "$(probe "/tmp/ryv_aluno.joao.txt" "$r")"
done

rm -f /tmp/ryv_*.txt
echo
echo "200 = renderiza | 307 = redirect HTTP | 200->X = meta-refresh | 404 = nao existe"
echo "Um 200 nao prova conteudo correto: conferir o corpo em telas suspeitas."
