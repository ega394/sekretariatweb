import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Admin Setda" },
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  const header = (
    <header className="site-header">
      <div className="container admin-bar">
        <div>
          <div className="eyebrow">Admin · Sekretariat Daerah Kota Tarakan</div>
          <strong>Pimpinan &amp; Pejabat</strong>
        </div>
        <form action={logoutAction}>
          <span className="muted">{user.email ?? user.externalId} </span>
          <button type="submit" className="link">Keluar</button>
        </form>
      </div>
    </header>
  );

  if (!user.userId) {
    return (
      <>
        {header}
        <main className="container narrow">
          <h1>Akun belum diberi akses</h1>
          <p>
            Anda berhasil masuk, tetapi akun ini belum dihubungkan ke pengguna admin.
            Berikan ID akun berikut kepada administrator sistem:
          </p>
          <p>
            <code>{user.externalId}</code>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="container">{children}</main>
    </>
  );
}
