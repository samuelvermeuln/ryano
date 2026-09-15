import { expect, it } from "vitest";
import { ZodError } from "zod";
import { createSchool } from "@/modules/school/domain/school";

it.each([
  { name: " " }, { ownerUserId: "" }, { id: " " }, { slug: "Invalid Slug" },
  { joinPolicy: "INVALID" }, { coachSelectionPolicy: "INVALID" }, { ownerUserId: " user-1 " },
])("rejects invalid domain input %j", (invalid) => {
  expect(() => createSchool({ id: "school-1", name: "Aqua", slug: "aqua", ownerUserId: "user-1", ...invalid } as Parameters<typeof createSchool>[0], new Date())).toThrow(ZodError);
});

it("rejects an invalid creation timestamp", () => {
  expect(() => createSchool({ id: "s", name: "Aqua", slug: "aqua", ownerUserId: "u" }, new Date("invalid"))).toThrow(ZodError);
});

it("creates a school with safe defaults and explicit identity [T011]", () => {
  const now = new Date("2026-09-07T00:00:00Z");
  expect(createSchool({ id: "school-1", name: " Escola Aqua ", slug: "escola-aqua", ownerUserId: "user-1" }, now)).toEqual({
    id: "school-1", name: "Escola Aqua", slug: "escola-aqua", ownerUserId: "user-1",
    status: "ACTIVE", joinPolicy: "REQUIRE_APPROVAL", coachSelectionPolicy: "ADMIN_ASSIGNS",
    description: null, logoUrl: null, createdAt: now, updatedAt: now, deactivatedAt: null, archivedAt: null,
  });
});
