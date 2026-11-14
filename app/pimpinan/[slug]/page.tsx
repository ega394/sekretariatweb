import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicHolder } from "@/db/read-models/pimpinan";

export const dynamic = "force-dynamic";

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

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const holder = await getPublicHolder(params.slug);
  if (!holder) return { title: "Jabatan tidak ditemukan" };
  return {
    title: holder.position_title,
    description: `${holder.position_title} — ${
      holder.person_display_name ?? holder.person_full_name
    }, ${holder.unit_name}.`,
  };
}

export default async function PositionPage({
  params,
}: {
  params: { slug: string };
}) {
  const holder = await getPublicHolder(params.slug);
  if (!holder) notFound();

  const acting = actingLabel(holder.assignment_type_code);
  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="eyebrow">{holder.unit_name}</div>
          <h1 style={{ margin: ".25rem 0 0" }}>
            {holder.position_title}
            {acting && <span className="badge">{acting}</span>}
          </h1>
        </div>
      </header>
      <main className="container detail">
        <div className="breadcrumb">
          <Link href="/pimpinan">Pimpinan</Link> › {holder.position_title}
        </div>
        <dl>
          <dt>Pejabat</dt>
          <dd>{holder.person_display_name ?? holder.person_full_name}</dd>
          <dt>Jabatan</dt>
          <dd>{holder.position_title}</dd>
          <dt>Unit</dt>
          <dd>{holder.unit_name}</dd>
          <dt>Sifat penunjukan</dt>
          <dd>{acting ?? "Definitif"}</dd>
        </dl>
      </main>
    </>
  );
}
