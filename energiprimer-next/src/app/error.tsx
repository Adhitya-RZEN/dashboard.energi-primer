"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function ErrorPage({ retry }: ErrorPageProps) {
  return (
    <section className="mx-auto flex min-h-96 w-full max-w-2xl items-center justify-center">
      <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-6 text-center sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
          Application error
        </p>
        <h1 className="mt-3 text-2xl font-bold text-red-950">
          Halaman mengalami kendala.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-red-900/80">
          Coba muat ulang bagian ini. Detail error tidak ditampilkan kepada
          pengguna.
        </p>
        <button
          className="mt-6 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
          onClick={() => retry()}
          type="button"
        >
          Coba lagi
        </button>
      </div>
    </section>
  );
}
