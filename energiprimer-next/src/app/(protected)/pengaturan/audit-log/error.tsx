"use client";

export default function AuditLogError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
      <h1 className="text-lg font-bold">Audit Log tidak dapat dimuat</h1>
      <p className="mt-2 text-sm leading-6">
        Terjadi kendala saat membaca record audit. Coba ulangi tanpa mengubah
        data akun.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
      >
        Coba lagi
      </button>
    </div>
  );
}
