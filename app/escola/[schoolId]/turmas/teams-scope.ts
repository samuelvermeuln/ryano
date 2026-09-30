/**
 * SAM-15 — chave de escopo da store de turmas. Módulo sem diretiva: o Server
 * Component (page) e os Client Components chamam esta função, e um export de
 * arquivo "use client" não pode ser invocado do servidor.
 */
export const teamsScope = (schoolId: string) => `teams:${schoolId}`;
