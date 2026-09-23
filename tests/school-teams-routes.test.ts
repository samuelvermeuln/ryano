/**
 * T505/T506/T507 — Rotas HTTP de turmas.
 *
 * As rotas são adaptadores finos; o que precisa de teste aqui é a fronteira:
 * autenticação, o envelope de erro e, principalmente, a precedência do
 * `schoolId`/`teamId` da URL sobre qualquer valor vindo do corpo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listExecute: vi.fn(),
  createExecute: vi.fn(),
  detailExecute: vi.fn(),
  updateExecute: vi.fn(),
  addAthleteExecute: vi.fn(),
  removeAthleteExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/list-teams", () => ({
  ListTeams: class { execute = mocks.listExecute; },
  GetTeamDetail: class { execute = mocks.detailExecute; },
  UpdateTeam: class { execute = mocks.updateExecute; },
}));
vi.mock("@/modules/school/application/manage-team", () => ({
  CreateTeam: class { execute = mocks.createExecute; },
  ArchiveTeam: class { execute = vi.fn(); },
  AddAthleteToTeam: class { execute = mocks.addAthleteExecute; },
  RemoveAthleteFromTeam: class { execute = mocks.removeAthleteExecute; },
  AddCoachToTeam: class { execute = vi.fn(); },
  RemoveCoachFromTeam: class { execute = vi.fn(); },
}));

import { GET, POST } from "@/app/api/schools/[id]/teams/route";
import { PATCH } from "@/app/api/schools/[id]/teams/[teamId]/route";
import { POST as POST_ATHLETE, DELETE as DELETE_ATHLETE } from "@/app/api/schools/[id]/teams/[teamId]/athletes/route";

const schoolCtx = { params: Promise.resolve({ id: "school-1" }) };
const teamCtx = () => ({ params: Promise.resolve({ id: "school-1", teamId: "team-1" }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "user-owner" } });
  mocks.listExecute.mockResolvedValue({ items: [], nextCursor: null });
  mocks.createExecute.mockResolvedValue({ id: "team-1" });
  mocks.updateExecute.mockResolvedValue({ id: "team-1" });
  mocks.addAthleteExecute.mockResolvedValue({ id: "ta-1" });
  mocks.removeAthleteExecute.mockResolvedValue({ ok: true });
});

describe("GET /api/schools/[id]/teams [T505]", () => {
  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/schools/school-1/teams"), schoolCtx);
    expect(res.status).toBe(401);
    expect(mocks.listExecute).not.toHaveBeenCalled();
  });

  it("repassa filtros da query string", async () => {
    const res = await GET(
      new Request("http://localhost/api/schools/school-1/teams?limit=5&sportType=running&includeArchived=true"),
      schoolCtx);
    expect(res.status).toBe(200);
    expect(mocks.listExecute).toHaveBeenCalledWith("user-owner",
      expect.objectContaining({ schoolId: "school-1", limit: "5", sportType: "running" }));
  });
});

describe("POST /api/schools/[id]/teams [T505]", () => {
  it("cria e responde 201", async () => {
    const res = await POST(new Request("http://localhost/api/schools/school-1/teams", {
      method: "POST", body: JSON.stringify({ name: "Turma A", capacity: 20 }),
    }), schoolCtx);
    expect(res.status).toBe(201);
    expect(mocks.createExecute).toHaveBeenCalledWith("user-owner",
      expect.objectContaining({ schoolId: "school-1", name: "Turma A", capacity: 20 }));
  });

  it("ignora schoolId do corpo e usa o da URL", async () => {
    // Sem isso, quem administra a escola A criaria turmas na escola B.
    await POST(new Request("http://localhost/api/schools/school-1/teams", {
      method: "POST", body: JSON.stringify({ name: "Invasora", schoolId: "school-alheia" }),
    }), schoolCtx);
    expect(mocks.createExecute).toHaveBeenCalledWith("user-owner",
      expect.objectContaining({ schoolId: "school-1" }));
  });

  it("responde 400 para corpo não-JSON", async () => {
    const res = await POST(new Request("http://localhost/api/schools/school-1/teams", {
      method: "POST", body: "nao é json",
    }), schoolCtx);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/schools/[id]/teams/[teamId] [T506]", () => {
  it("ignora teamId do corpo e usa o da URL", async () => {
    await PATCH(new Request("http://localhost/api/schools/school-1/teams/team-1", {
      method: "PATCH", body: JSON.stringify({ name: "Novo", teamId: "team-alheia" }),
    }), teamCtx());
    expect(mocks.updateExecute).toHaveBeenCalledWith("user-owner",
      expect.objectContaining({ teamId: "team-1", name: "Novo" }));
  });
});

describe("vínculo de atletas [T507]", () => {
  it("POST adiciona atleta e responde 201", async () => {
    const res = await POST_ATHLETE(new Request("http://localhost/x", {
      method: "POST", body: JSON.stringify({ athleteId: "a-1" }),
    }), teamCtx());
    expect(res.status).toBe(201);
    expect(mocks.addAthleteExecute).toHaveBeenCalledWith("user-owner", { teamId: "team-1", athleteId: "a-1" });
  });

  it("POST rejeita corpo sem athleteId", async () => {
    const res = await POST_ATHLETE(new Request("http://localhost/x", {
      method: "POST", body: JSON.stringify({}),
    }), teamCtx());
    expect(res.status).toBe(400);
    expect(mocks.addAthleteExecute).not.toHaveBeenCalled();
  });

  it("DELETE lê athleteId da query string", async () => {
    const res = await DELETE_ATHLETE(
      new Request("http://localhost/x?athleteId=a-1", { method: "DELETE" }), teamCtx());
    expect(res.status).toBe(200);
    expect(mocks.removeAthleteExecute).toHaveBeenCalledWith("user-owner", { teamId: "team-1", athleteId: "a-1" });
  });

  it("DELETE sem athleteId responde 400", async () => {
    const res = await DELETE_ATHLETE(new Request("http://localhost/x", { method: "DELETE" }), teamCtx());
    expect(res.status).toBe(400);
  });

  it("propaga TEAM_CAPACITY_EXCEEDED como 409", async () => {
    const { SchoolError } = await import("@/modules/school/domain/errors");
    mocks.addAthleteExecute.mockRejectedValue(
      new SchoolError("TEAM_CAPACITY_EXCEEDED", "A turma atingiu a capacidade de 10 atletas.", 409));
    const res = await POST_ATHLETE(new Request("http://localhost/x", {
      method: "POST", body: JSON.stringify({ athleteId: "a-1" }),
    }), teamCtx());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "TEAM_CAPACITY_EXCEEDED" });
  });
});
