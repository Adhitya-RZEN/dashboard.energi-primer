export function OverviewUnavailable({ note }: { note?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
      <p className="font-semibold text-slate-600">Data belum tersedia</p>
      {note ? <p className="mt-1 text-xs leading-5">{note}</p> : null}
    </div>
  );
}

export function OverviewEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-semibold text-slate-700">
        Tidak ada data pada periode ini.
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Pilih periode lain atau periksa sumber data PostgreSQL.
      </p>
    </div>
  );
}

export function OverviewErrorState({
  label = "Overview",
}: { label?: string } = {}) {
  return (
    <section
      className="mx-auto w-full max-w-6xl rounded-2xl border border-red-200 bg-red-50 p-6 sm:p-8"
      role="alert"
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
        Data error
      </p>
      <h1 className="mt-2 text-xl font-bold text-red-950">
        Data {label} belum dapat dimuat.
      </h1>
      <p className="mt-2 text-sm leading-6 text-red-900/80">
        Koneksi read-only ke sumber data gagal. Tidak ada angka fallback yang
        ditampilkan agar data tidak menyesatkan.
      </p>
    </section>
  );
}
