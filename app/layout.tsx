import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sekretariat Daerah Kota Tarakan",
    template: "%s — Setda Kota Tarakan",
  },
  description:
    "Portal resmi Sekretariat Daerah Kota Tarakan: profil kelembagaan, pimpinan, agenda, dan informasi publik.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
