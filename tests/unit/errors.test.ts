import { describe, it, expect } from "vitest";
import { mapPgError, DomainError } from "@/domain/errors";

describe("mapPgError", () => {
  it("maps exclusion_violation (23P01) to assignment_overlap", () => {
    const e = mapPgError({ code: "23P01" });
    expect(e).toBeInstanceOf(DomainError);
    expect(e?.code).toBe("assignment_overlap");
  });
  it("maps check_violation (23514)", () => {
    expect(mapPgError({ code: "23514" })?.code).toBe("check_violation");
  });
  it("returns null for unknown errors", () => {
    expect(mapPgError({ code: "99999" })).toBeNull();
    expect(mapPgError(new Error("x"))).toBeNull();
  });
});
