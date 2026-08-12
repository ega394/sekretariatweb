import "server-only";
import { unstable_cache } from "next/cache";
import { getPublicDb } from "@/db/public-client";
import type { VPublicPimpinan } from "@/db/schema";

/**
 * Public read models for the Pimpinan surface.
 *
 * These read ONLY from `v_public_pimpinan` (which decorates the LOCKED
 * eligibility resolver `v_public_holder`). Eligibility is NEVER recomputed in
 * TypeScript — the view already returns only public-eligible current holders
 * (Traceability: Current Holder ≠ Public Holder, cascading eligibility).
 *
 * Reads are wrapped in `unstable_cache` with tags so that an admin mutation
 * which changes eligibility can `revalidateTag('pimpinan' | 'pimpinan:<slug>')`
 * and drop stale officeholders from the public pages.
 */

const TITLE_ORDER: Record<string, number> = {
  kepala_daerah: 0,
  wakil_kepala_daerah: 1,
  sekda: 2,
  asisten: 3,
  staf_ahli: 4,
  kepala_bagian: 5,
  kepala_subbagian: 6,
};

async function _listPublicPimpinan(): Promise<VPublicPimpinan[]> {
  const rows = await getPublicDb()
    .selectFrom("v_public_pimpinan")
    .selectAll()
    .execute();
  return rows.sort(
    (a, b) =>
      (TITLE_ORDER[a.position_type_code] ?? 99) -
        (TITLE_ORDER[b.position_type_code] ?? 99) ||
      a.position_title.localeCompare(b.position_title),
  );
}

export const listPublicPimpinan = unstable_cache(
  _listPublicPimpinan,
  ["pimpinan-list"],
  { tags: ["pimpinan"] },
);

export async function getPublicHolder(
  positionSlug: string,
): Promise<VPublicPimpinan | null> {
  const fn = unstable_cache(
    async (slug: string) => {
      const row = await getPublicDb()
        .selectFrom("v_public_pimpinan")
        .selectAll()
        .where("position_slug", "=", slug)
        .executeTakeFirst();
      return row ?? null;
    },
    ["pimpinan-detail", positionSlug],
    { tags: ["pimpinan", `pimpinan:${positionSlug}`] },
  );
  return fn(positionSlug);
}
