"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <h1>Terjadi kesalahan</h1>
      <p>Maaf, halaman tidak dapat dimuat saat ini.</p>
      <button onClick={() => reset()}>Coba lagi</button>
    </div>
  );
}
