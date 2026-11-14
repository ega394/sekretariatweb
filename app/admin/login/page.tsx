import type { Metadata } from "next";
import { loginAction } from "../(console)/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Masuk", robots: { index: false, follow: false } };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="container narrow">
      <div className="eyebrow">Sekretariat Daerah Kota Tarakan</div>
      <h1>Masuk Admin</h1>
      {searchParams.error && (
        <p role="alert" className="flash error">
          {searchParams.error}
        </p>
      )}
      <form action={loginAction} className="form">
        <label>
          Email
          <input type="email" name="email" autoComplete="username" required />
        </label>
        <label>
          Kata sandi
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Masuk</button>
      </form>
    </main>
  );
}
