import { describe, it, expect } from "vitest";
import { sql } from "kysely";
import { getPublicDb } from "@/db/public-client";
import { can } from "@/rbac/authorization";
import { createAssignment } from "@/domain/services/assignment-service";
import { recordVerification } from "@/domain/services/verification-service";

// Fixed IDs from the seed + global setup.
const SEKDA_POS = "20000000-0000-0000-0000-000000000003";
const SUPERADMIN = "00000000-0000-0000-0000-000000000001";
const VERIFIER = "00000000-0000-0000-0000-0000000000a1";
const PUBLISHER = "00000000-0000-0000-0000-0000000000a2";
const KHAIRUL = "30000000-0000-0000-0000-000000000001";

describe("public boundary (v_public_* only)", () => {
  it("lists exactly the 3 eligible public holders", async () => {
    const rows = await getPublicDb()
      .selectFrom("v_public_pimpinan")
      .selectAll()
      .execute();
    expect(rows.length).toBe(3);
  });

  it("exposes Abdul Azis Hasan as Sekretaris Daerah", async () => {
    const row = await getPublicDb()
      .selectFrom("v_public_pimpinan")
      .selectAll()
      .where("position_slug", "=", "sekretaris-daerah")
      .executeTakeFirst();
    expect(row?.person_display_name).toBe("Abdul Azis Hasan");
  });

  it("publicDb is DENIED on base table persons", async () => {
    await expect(
      // deliberately reach past the typed views with raw SQL
      sql`SELECT 1 FROM persons LIMIT 1`.execute(getPublicDb() as never),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("RBAC — Publish ≠ Verify", () => {
  it("verifier can write_verification but NOT manage_org_structure", async () => {
    expect(await can(VERIFIER, "write_verification")).toBe(true);
    expect(await can(VERIFIER, "manage_org_structure")).toBe(false);
  });
  it("publisher holds neither in Slice-1 (no fake permission)", async () => {
    expect(await can(PUBLISHER, "write_verification")).toBe(false);
    expect(await can(PUBLISHER, "manage_org_structure")).toBe(false);
  });
  it("super_admin holds both", async () => {
    expect(await can(SUPERADMIN, "write_verification")).toBe(true);
    expect(await can(SUPERADMIN, "manage_org_structure")).toBe(true);
  });
});

describe("assignment overlap is enforced by the DB, not TS", () => {
  it("rejects a second active substantive on the Sekda position", async () => {
    const revalidated: string[][] = [];
    await expect(
      createAssignment(
        {
          actorUserId: SUPERADMIN,
          personId: KHAIRUL,
          positionId: SEKDA_POS,
          positionSlug: "sekretaris-daerah",
          assignmentTypeCode: "definitif",
          assignmentClass: "substantive",
          startDate: "2026-08-01",
        },
        (t) => {
          revalidated.push(t);
        },
      ),
    ).rejects.toMatchObject({ code: "assignment_overlap" });
    expect(revalidated).toHaveLength(0); // no revalidation on failure
  });

  it("blocks an unauthorized actor before touching the DB", async () => {
    await expect(
      createAssignment(
        {
          actorUserId: VERIFIER, // lacks manage_org_structure
          personId: KHAIRUL,
          positionId: SEKDA_POS,
          positionSlug: "sekretaris-daerah",
          assignmentTypeCode: "definitif",
          assignmentClass: "substantive",
          startDate: "2030-01-01",
        },
        () => {},
      ),
    ).rejects.toThrow(/Not authorized/);
  });
});

describe("verification write revalidates the public cache", () => {
  it("verifier records a verification and triggers revalidateTag('pimpinan')", async () => {
    const tags: string[][] = [];
    const id = await recordVerification(
      {
        actorUserId: VERIFIER,
        target: { kind: "person", id: KHAIRUL },
        status: "verified",
        sourceType: "media",
        sourceReference: "integration-test",
      },
      (t) => {
        tags.push(t);
      },
    );
    expect(id).toBeTruthy();
    expect(tags).toContainEqual(["pimpinan"]);
  });

  it("publisher cannot record a verification (Publish ≠ Verify)", async () => {
    await expect(
      recordVerification(
        {
          actorUserId: PUBLISHER,
          target: { kind: "person", id: KHAIRUL },
          status: "verified",
          sourceType: "media",
        },
        () => {},
      ),
    ).rejects.toThrow(/Not authorized/);
  });
});
