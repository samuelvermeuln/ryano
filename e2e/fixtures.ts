/**
 * Fixtures estáticas dos testes E2E.
 * Todas as entidades têm e-mails únicos para que os testes sejam idempotentes:
 * re-executar não duplica escolas, professores ou alunos.
 */

export const ESCOLA_1 = {
  ownerName: "Dono Escola Alpha",
  ownerEmail: "owner.alpha@ryvano-e2e.test",
  ownerPassword: "Teste123!",
  schoolName: "Escola Alpha de Natação",
  schoolEmail: "contato@alpha-natacao.test",
  schoolPhone: "11912340001",
  cnpj: "12345678000191",
  postalCode: "01310100",   // Av. Paulista — ViaCEP real
  addressNumber: "100",
  sportTypes: ["swim", "run", "bike"],
  joinPolicy: "REQUIRE_APPROVAL" as const,
};

export const ESCOLA_2 = {
  ownerName: "Dono Escola Beta",
  ownerEmail: "owner.beta@ryvano-e2e.test",
  ownerPassword: "Teste123!",
  schoolName: "Escola Beta de Ciclismo",
  schoolEmail: "contato@beta-ciclismo.test",
  schoolPhone: "11912340002",
  cnpj: "98765432000100",
  postalCode: "04538133",   // Vila Olímpia — ViaCEP real
  addressNumber: "200",
  sportTypes: ["bike", "run", "swim"],
  joinPolicy: "AUTO_APPROVE" as const,
};

// Professor 1 — vinculado a Escola Alpha
export const PROFESSOR_1 = {
  name: "Prof. Carlos Mendes",
  email: "prof.carlos@ryvano-e2e.test",
  password: "Teste123!",
  displayName: "Carlos Mendes",
  bio: "Treinador de natação e triathlon.",
};

// Professor 2 — vinculado a Escola Alpha
export const PROFESSOR_2 = {
  name: "Prof. Ana Lima",
  email: "prof.ana@ryvano-e2e.test",
  password: "Teste123!",
  displayName: "Ana Lima",
  bio: "Especialista em corrida de rua.",
};

// Professor 3 — independente (sem escola)
export const PROFESSOR_3 = {
  name: "Prof. Ricardo Souza",
  email: "prof.ricardo@ryvano-e2e.test",
  password: "Teste123!",
  displayName: "Ricardo Souza",
  bio: "Personal trainer independente.",
};

export const ALUNOS = [
  {
    name: "Aluno João Silva",
    email: "aluno.joao@ryvano-e2e.test",
    password: "Teste123!",
  },
  {
    name: "Aluna Maria Oliveira",
    email: "aluna.maria@ryvano-e2e.test",
    password: "Teste123!",
  },
  {
    name: "Aluno Pedro Santos",
    email: "aluno.pedro@ryvano-e2e.test",
    password: "Teste123!",
  },
  {
    name: "Aluna Fernanda Costa",
    email: "aluna.fernanda@ryvano-e2e.test",
    password: "Teste123!",
  },
  {
    name: "Aluno Lucas Rocha",
    email: "aluno.lucas@ryvano-e2e.test",
    password: "Teste123!",
  },
] as const;

/**
 * Turma usada pelos testes de /escola/<id>/turmas.
 *
 * Nome fixo (e não aleatório) de propósito: é o que permite ao spec detectar
 * uma turma deixada para trás por uma execução que falhou no meio e
 * reaproveitá-la, em vez de acumular uma turma nova a cada rodada.
 */
export const TURMA_E2E = {
  name: "Turma E2E — Corrida Manhã",
  sportType: "Corrida",
  level: "Iniciante",
  location: "Parque Ibirapuera",
  capacity: 20,
} as const;

/** Convite usado pelos testes de /escola/<id>/convites. */
export const CONVITE_E2E = {
  expiresInDays: "7",
  maxUses: "5",
} as const;

// Treinos a prescrever: natação, corrida e ciclismo para cada atleta
export const TREINOS_PARA_PRESCREVER = [
  { sportType: "swim",  title: "Treino de Natação",   durationMinutes: "45", distanceKm: "2" },
  { sportType: "run",   title: "Treino de Corrida",   durationMinutes: "60", distanceKm: "10" },
  { sportType: "bike",  title: "Treino de Ciclismo",  durationMinutes: "90", distanceKm: "40" },
] as const;
