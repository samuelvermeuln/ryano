// @vitest-environment jsdom
/**
 * SAM-6 — "Adicionar membro" on /escola/[schoolId]/membros opens a centered
 * modal (architecture/rules/ui.md) instead of replacing the trigger with an
 * inline form. What the E2E spec cannot prove without a browser and a database
 * is covered here: the dialog contract, the focus trap, focus returning to the
 * trigger, and that the submitted payload still carries the dynamic schoolId
 * and the roles the operator picked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// The screen imports the "use server" module; this test only cares about what
// the form renders and submits, not what the action does with it.
vi.mock("@/app/escola/[schoolId]/membros/actions", () => ({
  addMemberAction: vi.fn(),
  deactivateMemberAction: vi.fn(),
  addRoleAction: vi.fn(),
  removeRoleAction: vi.fn(),
}));

import { AddMemberForm } from "@/app/escola/[schoolId]/membros/add-member-form";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const SCHOOL_ID = "cmue80z3v003kod8dpb6yt51b";

function trigger() {
  return screen.getByRole("button", { name: "Adicionar membro" });
}

function openModal() {
  fireEvent.click(trigger());
  return screen.getByRole("dialog");
}

describe("AddMemberForm — trigger", () => {
  it("shows only the trigger before any click, with no dialog mounted", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);

    expect(trigger()).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The trigger must survive the modal being open, because focus returns to it.
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("does not render a form until the modal is opened, so nothing is submittable from the list", () => {
    const { container } = render(<AddMemberForm schoolId={SCHOOL_ID} />);
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("AddMemberForm — modal contract (rules/ui.md)", () => {
  it("opens a labelled, modal dialog titled 'Adicionar membro'", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Adicionar membro");

    // The accessible name must come from the visible heading, not only from the
    // attribute, so screen readers announce the same title the user sees.
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const heading = within(dialog).getByRole("heading", { name: "Adicionar membro" });
    expect(heading.id).toBe(titleId);

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("renders through a portal on document.body, outside the screen's container", () => {
    const { container } = render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    // The members screen lives inside the AppShell, whose motion wrapper has a
    // transform: without the portal that would become the containing block of
    // the fixed backdrop and clip it.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("uses no hard-coded surface colour, so the light theme is not black-on-black", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    expect(dialog.className).toContain("glass-strong");
    expect(dialog.className).not.toMatch(/bg-\[#/);
    // Only utilities globals.css remaps for [data-theme="light"] may be used;
    // border-white/8 and bg-white/[0.03] are not remapped and vanish there.
    const html = dialog.outerHTML;
    expect(html).not.toContain("border-white/8");
    expect(html).not.toMatch(/bg-white\/\[0\.0[234]\]/);
  });

  it("locks page scroll while open and restores the previous value on close", () => {
    document.body.style.overflow = "scroll";
    render(<AddMemberForm schoolId={SCHOOL_ID} />);

    openModal();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).toBe("scroll");
  });
});

describe("AddMemberForm — fields and payload", () => {
  it("carries the dynamic schoolId in the submitted form, never a hard-coded one", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    const form = dialog.querySelector("form") as HTMLFormElement;
    const hidden = form.querySelector('input[name="schoolId"]') as HTMLInputElement;
    expect(hidden.value).toBe(SCHOOL_ID);
  });

  it("asks for the e-mail with an associated label and keeps the field required", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    const email = within(dialog).getByLabelText("E-mail da pessoa") as HTMLInputElement;
    expect(email.name).toBe("email");
    expect(email.type).toBe("email");
    // Browser-level validation is the first gate; the action validates again.
    expect(email.required).toBe(true);
    expect(email.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("offers every assignable role as a named checkbox, and never OWNER", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    const boxes = Array.from(
      dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="roles"]'),
    );
    const values = boxes.map((box) => box.value);
    expect(values).toContain("ATHLETE");
    expect(values).toContain("COACH");
    expect(values).toContain("ADMIN");
    // Ownership transfer is not an "add a role" operation.
    expect(values).not.toContain("OWNER");
    // Nothing pre-selected: the action rejects an empty selection, and a default
    // would silently grant a role the operator never chose.
    expect(boxes.every((box) => !box.checked)).toBe(true);
  });

  it("shows a confirm and a cancel action inside the dialog", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    const submit = within(dialog).getByRole("button", { name: "Adicionar" });
    expect(submit.getAttribute("type")).toBe("submit");
    expect(within(dialog).getByRole("button", { name: "Cancelar" }).getAttribute("type")).toBe(
      "button",
    );
  });

  it("does not reuse the trigger's name on the confirm button, keeping both unambiguous", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    openModal();

    // Exactly one control is named "Adicionar membro" while the dialog is open:
    // the trigger. getByRole throws on two matches, which is the assertion.
    expect(trigger().getAttribute("type")).toBe("button");
  });
});

describe("AddMemberForm — closing", () => {
  it("closes on Cancelar without submitting", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();
    const form = dialog.querySelector("form") as HTMLFormElement;
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", onSubmit);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    openModal();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on a backdrop click, but not when the dialog itself is clicked", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeNull();

    // Two "Fechar" controls exist: the backdrop (first, in DOM order) and the ✕.
    const [backdrop] = screen.getAllByRole("button", { name: "Fechar", hidden: true });
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts each opening from clean defaults, with no leftover typing", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const first = openModal();
    const email = within(first).getByLabelText("E-mail da pessoa") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "alguem@exemplo.com" } });
    fireEvent.click(within(first).getByRole("button", { name: "Cancelar" }));

    const second = openModal();
    const reopened = within(second).getByLabelText("E-mail da pessoa") as HTMLInputElement;
    expect(reopened.value).toBe("");
  });
});

describe("AddMemberForm — focus (SAM-6 acceptance)", () => {
  it("moves focus into the dialog, onto the first field", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    const email = within(dialog).getByLabelText("E-mail da pessoa");
    expect(document.activeElement).toBe(email);
  });

  it("returns focus to the 'Adicionar membro' trigger when the modal closes", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(document.activeElement).toBe(trigger());
  });

  it("returns focus to the trigger after Escape too", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    openModal();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(document.activeElement).toBe(trigger());
  });

  it("keeps Tab inside the dialog, so the list behind the backdrop is unreachable", () => {
    render(<AddMemberForm schoolId={SCHOOL_ID} />);
    const dialog = openModal();

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    expect(focusable.length).toBeGreaterThan(1);

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
