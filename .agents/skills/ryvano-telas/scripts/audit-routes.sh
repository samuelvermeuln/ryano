#!/usr/bin/env bash
# Auditoria estatica de rotas: inventario, links quebrados, pastas vazias,
# paginas sem guard. Nao precisa de servidor rodando.
# Uso: bash .agents/skills/ryvano-telas/scripts/audit-routes.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

echo "== INVENTARIO =="
echo "paginas:     $(find app -name page.tsx | wc -l)"
echo "layouts:     $(find app -name layout.tsx | wc -l)"
echo "rotas API:   $(find app/api -name route.ts | wc -l)"
echo "models:      $(grep -c '^model ' prisma/schema.prisma)"
echo "enums:       $(grep -c '^enum ' prisma/schema.prisma)"

echo
echo "== PASTAS SEM page.tsx (rota linkada que da 404) =="
found=0
while IFS= read -r d; do
  if [ -z "$(ls -A "$d")" ]; then
    echo "  [VAZIA] $d"
    found=1
  fi
done < <(find app -type d)
[ "$found" -eq 0 ] && echo "  (nenhuma)"

echo
echo "== LINKS INTERNOS -> PAGINA EXISTE? =="
# Coleta hrefs estaticos e template literals, normaliza [param] e ${x} para ID
{
  grep -rhoE 'href="/[^"]*"' app components --include="*.tsx" 2>/dev/null | sed 's/href="//; s/"$//'
  grep -rhoE 'href=\{`/[^`]+`\}' app components --include="*.tsx" 2>/dev/null | sed 's/href={`//; s/`}//'
  grep -rhoE 'href: `/[^`]+`' app components --include="*.tsx" 2>/dev/null | sed 's/href: `//; s/`//'
} | sed 's/\${[^}]*}/ID/g' | sed 's/?.*//; s/#.*//' | grep -v '^/api/' | sort -u > /tmp/_links.txt

find app -name page.tsx | sed 's|^app||; s|/page\.tsx$||' | sed 's/\[[^]]*\]/ID/g' \
  | sed 's|^$|/|' | sort -u > /tmp/_pages.txt

broken=0
while IFS= read -r link; do
  [ -z "$link" ] && continue
  if ! grep -qxF "$link" /tmp/_pages.txt; then
    echo "  [QUEBRADO] $link"
    broken=$((broken + 1))
  fi
done < /tmp/_links.txt
[ "$broken" -eq 0 ] && echo "  (nenhum)"

echo
echo "== GUARDS POR AREA =="
for f in $(find app -name layout.tsx | sort); do
  g=$(grep -oE 'require(Admin|OnboardedSession|Session|OnboardedUser|UserRecord)\(' "$f" | head -1)
  flag=$(grep -c 'isSchoolModuleEnabled' "$f")
  printf "  %-46s %-28s flag:%s\n" "${f#app}" "${g:-<nenhum>}" "$flag"
done

echo
echo "== PAGINAS SEM GUARD HERDADO DE LAYOUT =="
# Cobre todos os guards exportados por server/auth-guards.ts. Ao adicionar um
# guard novo la, incluir aqui — senao a pagina aparece como PUBLICA sem ser.
GUARD_RE='require(Admin|OnboardedSession|Session|OnboardedUser|UserRecord)'
for p in $(find app -name page.tsx | grep -v '^app/api'); do
  d=$(dirname "$p"); guarded=0
  while [ "$d" != "." ] && [ "$d" != "app" ]; do
    if [ -f "$d/layout.tsx" ] && grep -qE "$GUARD_RE" "$d/layout.tsx"; then
      guarded=1; break
    fi
    d=$(dirname "$d")
  done
  if [ "$guarded" -eq 0 ]; then
    own=$(grep -loE "$GUARD_RE" "$p" 2>/dev/null)
    printf "  %-52s %s\n" "${p#app}" "$([ -n "$own" ] && echo 'guard na propria pagina' || echo 'PUBLICA')"
  fi
done

echo
echo "  Conferir: toda linha 'PUBLICA' deve ser intencionalmente publica."
echo "  Guards conhecidos: $(grep -oE 'export async function require[A-Za-z]+' server/auth-guards.ts | sed 's/.*function //' | tr '\n' ' ')"
