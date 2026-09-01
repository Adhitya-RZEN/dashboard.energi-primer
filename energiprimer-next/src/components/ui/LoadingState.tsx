type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Memuat..." }: LoadingStateProps) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span
          aria-hidden="true"
          className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-700"
        />
        {label}
      </div>
    </div>
  );
}

export function DashboardLoadingState({
  label = "Memuat dashboard...",
}: LoadingStateProps) {
  return (
    <section aria-live="polite" aria-label={label} className="space-y-6">
      <div className="space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
        <div className="h-9 w-3/4 max-w-md animate-pulse rounded-lg bg-slate-200" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-100" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <div className="h-10 w-28 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-10 w-32 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-10 w-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-10 w-32 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="h-4 w-2/3 rounded bg-slate-100" />
            <div className="mt-8 h-8 w-1/2 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </section>
  );
}
