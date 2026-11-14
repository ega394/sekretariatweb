import { describe, it, expect } from "vitest";
import { slugify } from "@/domain/slug";

describe("slugify", () => {
  it("lowercases, strips accents and collapses separators", () => {
    expect(slugify("  Abdul  Azis Hasan ")).toBe("abdul-azis-hasan");
    expect(slugify("dr. H. Khairul, M.Kes.")).toBe("dr-h-khairul-m-kes");
    expect(slugify("Élan Café")).toBe("elan-cafe");
  });
  it("never returns an empty slug", () => {
    expect(slugify("***")).toBe("item");
  });
});
