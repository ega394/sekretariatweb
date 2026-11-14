import { describe, it, expect } from "vitest";
import { getAdminDb } from "@/db/admin-client";
import { mapIdentityToUser } from "@/auth/users";
import { createPerson } from "@/domain/services/person-service";
import { createAssignment, endAssignment } from "@/domain/services/assignment-service";
import { recordVerification } from "@/domain/services/verification-service";
import { listPositionsOverview, listAssignments } from "@/db/read-models/admin-pimpinan";

const SUPERADMIN = "00000000-0000-0000-0000-000000000001";
const VERIFIER = "00000000-0000-0000-0000-0000000000a1";
const SEKDA_POS = "20000000-0000-0000-0000-000000000003";
const today = new Date().toISOString().slice(0, 10);

describe("identity -> user mapping", () => {
  it("maps a known external id to our user and ignores unknown ones", async () => {
    await getAdminDb()
      .updateTable("users")
      .set({ external_auth_id: "ext-superadmin-1" })
      .where("id", "=", SUPERADMIN)
      .execute();
    expect(await mapIdentityToUser("ext-superadmin-1")).toBe(SUPERADMIN);
    expect(await mapIdentityToUser("ext-nobody")).toBeNull();
  });
});

describe("admin Pimpinan lifecycle (service layer)", () => {
  it("person -> acting assignment -> verify -> public Plt -> end -> restored", async () => {
    const noop = () => {};
    const tags: string[][] = [];
    const rev = (t: string[]) => {
      tags.push(t);
    };

    // 1) create a person: not public (no verification yet)
    const person = await createPerson({ actorUserId: SUPERADMIN, fullName: "Uji Plt Service" });
    expect(person.slug).toMatch(/^uji-plt-service/);

    // 2) acting (Plt) assignment on Sekda: class derived from the DB ref table;
    //    allowed to overlap the verified definitif holder
    const assignmentId = await createAssignment(
      {
        actorUserId: SUPERADMIN,
        personId: person.id,
        positionId: SEKDA_POS,
        assignmentTypeCode: "plt",
        startDate: today,
      },
      rev,
    );
    expect(tags).toContainEqual(["pimpinan", "pimpinan:sekretaris-daerah"]);

    const row = await getAdminDb()
      .selectFrom("assignments")
      .select(["assignment_class", "created_by"])
      .where("id", "=", assignmentId)
      .executeTakeFirstOrThrow();
    expect(row.assignment_class).toBe("acting");
    expect(row.created_by).toBe(SUPERADMIN);

    // 3) current holder is the Plt (fact), but NOT public yet (unverified): no cross fallback
    let sekda = (await listPositionsOverview()).find((p) => p.position_slug === "sekretaris-daerah")!;
    expect(sekda.current_person).toBe("Uji Plt Service");
    expect(sekda.is_publicly_shown).toBe(false);

    // 4) verify person + assignment -> now publicly shown
    await recordVerification(
      { actorUserId: VERIFIER, target: { kind: "person", id: person.id }, status: "verified", sourceType: "sk" },
      noop,
    );
    await recordVerification(
      { actorUserId: VERIFIER, target: { kind: "assignment", id: assignmentId }, status: "verified", sourceType: "sk" },
      noop,
    );
    sekda = (await listPositionsOverview()).find((p) => p.position_slug === "sekretaris-daerah")!;
    expect(sekda.is_publicly_shown).toBe(true);

    // 5) end the assignment -> definitif Abdul Azis is the holder again
    await endAssignment(SUPERADMIN, assignmentId, today, noop);
    sekda = (await listPositionsOverview()).find((p) => p.position_slug === "sekretaris-daerah")!;
    expect(sekda.current_person).toBe("Abdul Azis Hasan");
    const history = (await listAssignments()).find((a) => a.id === assignmentId)!;
    expect(history.assignment_status).toBe("ended"); // history is kept
  });

  it("rejects an unknown assignment type with a domain error", async () => {
    await expect(
      createAssignment(
        {
          actorUserId: SUPERADMIN,
          personId: "30000000-0000-0000-0000-000000000001",
          positionId: SEKDA_POS,
          assignmentTypeCode: "ngawur",
          startDate: today,
        },
        () => {},
      ),
    ).rejects.toMatchObject({ code: "unknown_assignment_type" });
  });

  it("verifier cannot create persons or assignments (Publish/Verify/Manage are separate)", async () => {
    await expect(createPerson({ actorUserId: VERIFIER, fullName: "Tidak Boleh" })).rejects.toThrow(
      /Not authorized/,
    );
  });
});
