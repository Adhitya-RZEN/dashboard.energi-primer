export default function AuditLogLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" aria-busy="true">
      <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-12 w-64 animate-pulse rounded bg-slate-200" />
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-96 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}
