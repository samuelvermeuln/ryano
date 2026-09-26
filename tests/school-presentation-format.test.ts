import { expect, it } from "vitest";

import { formatAddress, formatPhoneBR } from "@/modules/school/presentation/format";

const full = {
  postalCode: "01310-100",
  street: "Avenida Paulista",
  number: "1000",
  complement: "sala 42",
  district: "Bela Vista",
  city: "São Paulo",
  state: "SP",
  country: "Brasil",
};
const empty = {
  postalCode: null, street: null, number: null, complement: null,
  district: null, city: null, state: null, country: null,
};

it("joins a complete address", () => {
  expect(formatAddress(full)).toBe(
    "Avenida Paulista, 1000 — sala 42 — Bela Vista · São Paulo/SP · 01310-100 · Brasil",
  );
});

it("skips the parts that were never filled in", () => {
  expect(formatAddress({ ...empty, city: "Santos", state: "SP" })).toBe("Santos/SP");
  expect(formatAddress({ ...empty, street: "Rua A" })).toBe("Rua A");
});

it.each([
  { name: "null", value: null },
  { name: "undefined", value: undefined },
  { name: "all fields empty", value: empty },
])("returns null for $name so callers can say 'não informado'", ({ value }) => {
  expect(formatAddress(value)).toBeNull();
});

it.each([
  { input: "+5511987654321", expected: "+55 (11) 98765-4321" },
  { input: "+551132654321", expected: "+55 (11) 3265-4321" },
])("formats $input as a Brazilian number", ({ input, expected }) => {
  expect(formatPhoneBR(input)).toBe(expected);
});

it("returns an unrecognised number unchanged rather than mangling it", () => {
  expect(formatPhoneBR("+12025550123")).toBe("+12025550123");
});

it("returns null when there is no phone", () => {
  expect(formatPhoneBR(null)).toBeNull();
  expect(formatPhoneBR(undefined)).toBeNull();
});
