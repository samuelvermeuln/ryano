import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two sibling dynamic segments with different slug names ("[athleteId]" next to
 * "[membershipId]") make the Next.js router throw on every request it tries to
 * resolve — a 500 across the whole app, not just those routes.
 *
 * `next build` does not catch this: it compiles cleanly and even lists both
 * routes, because the check runs when the route tree is sorted at request time.
 * So the guard has to live here.
 */
const APP_DIR = join(process.cwd(), "app");

function dynamicSiblings(dir: string): { dir: string; slugs: string[] }[] {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  const slugs = entries
    .map((e) => e.name)
    .filter((name) => name.startsWith("[") && name.endsWith("]"))
    // Catch-all and optional catch-all occupy a different position in the tree.
    .filter((name) => !name.startsWith("[..."))
    .filter((name) => !name.startsWith("[[..."));

  const here = slugs.length > 1 ? [{ dir: relative(process.cwd(), dir), slugs: slugs.sort() }] : [];
  return entries.reduce<{ dir: string; slugs: string[] }[]>(
    (found, entry) => found.concat(dynamicSiblings(join(dir, entry.name))),
    here,
  );
}

describe("app router dynamic segments", () => {
  it("never places two differently named slugs at the same path position", () => {
    expect(dynamicSiblings(APP_DIR)).toEqual([]);
  });

  it("reports a conflict when one is actually present", () => {
    // Guards the guard: an assertion that only ever sees a healthy tree would
    // keep passing if the walk silently stopped working.
    const root = mkdtempSync(join(tmpdir(), "slug-scan-"));
    try {
      mkdirSync(join(root, "athletes", "[athleteId]"), { recursive: true });
      mkdirSync(join(root, "athletes", "[membershipId]"), { recursive: true });
      const [conflict] = dynamicSiblings(root);
      expect(conflict.slugs).toEqual(["[athleteId]", "[membershipId]"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the same slug name repeated at different depths", () => {
    // schools/[id]/teams/[teamId] is legal: the names sit at different
    // positions. Only same-position siblings conflict.
    const root = mkdtempSync(join(tmpdir(), "slug-scan-"));
    try {
      mkdirSync(join(root, "[id]", "teams", "[teamId]"), { recursive: true });
      expect(dynamicSiblings(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not flag a catch-all beside a named segment", () => {
    // app/api/auth/[...nextauth] style routes resolve at a different position.
    const root = mkdtempSync(join(tmpdir(), "slug-scan-"));
    try {
      mkdirSync(join(root, "[...nextauth]"), { recursive: true });
      mkdirSync(join(root, "[id]"), { recursive: true });
      expect(dynamicSiblings(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
