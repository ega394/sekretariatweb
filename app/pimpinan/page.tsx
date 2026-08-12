import type { Metadata } from "next";
import Link from "next/link";
import { listPublicPimpinan } from "@/db/read-models/pimpinan";

// Rendered per request; the DB read is cached + tag-revalidated (no stale
// officeholder). force-dynamic keeps `next build` from prerendering (no DB
// dependency at build time).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pimpinan",
  description:
    "Direktori pimpinan dan pejabat resmi di lingkungan Sekretariat Daerah Kota Tarakan.",
};

function actingLabel(typeCode: string): string | null {
  switch (typeCode) {
    case "plt":
      return "Plt.";
    case "plh":
      return "Plh.";
    case "pj":
      return "Pj.";
    default:
      return null;
  }
}

export default async function PimpinanPage() {
  const rows = await listPublicPimpinan();
  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="eyebrow">Sekretariat Daerah Kota Tarakan</div>
          <h1 style={{ margin: ".25rem 0 0" }}>Pimpinan &amp; Pejabat</h1>
        </div>
      </header>
      <main className="container">
        {rows.length === 0 ? (
          <p>Informasi pimpinan sedang diperbarui.</p>
        ) : (
          <ul className="card-list">
            {rows.map((r) => {
              const acting = actingLabel(r.assignment_type_code);
              return (
                <li key={r.position_id}>
                  <Link className="card" href={`/pimpinan/${r.position_slug}`}>
                    <div className="role">
                      {r.position_title}
                      {acting && <span className="badge">{acting}</span>}
                    </div>
                    <div className="name">
                      {r.person_display_name ?? r.person_full_name}
                    </div>
                    <div className="role">{r.unit_name}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
