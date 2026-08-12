import Link from "next/link";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="container">
          <div className="eyebrow">Pemerintah Kota Tarakan</div>
          <h1 style={{ margin: ".25rem 0 0" }}>Sekretariat Daerah</h1>
        </div>
      </header>
      <main className="container">
        <p>Portal resmi Sekretariat Daerah Kota Tarakan.</p>
        <p>
          <Link href="/pimpinan">Lihat Pimpinan &amp; Pejabat →</Link>
        </p>
      </main>
    </>
  );
}
