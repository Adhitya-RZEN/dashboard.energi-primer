import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-96 w-full max-w-2xl items-center justify-center">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <p className="text-5xl font-bold tracking-tight text-sky-700">404</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">
          Halaman tidak ditemukan.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
          Route yang diminta belum tersedia pada foundation ini.
        </p>
        <Link
          className="mt-6 inline-flex rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2"
          href="/"
        >
          Kembali ke beranda
        </Link>
      </div>
    </section>
  );
}
