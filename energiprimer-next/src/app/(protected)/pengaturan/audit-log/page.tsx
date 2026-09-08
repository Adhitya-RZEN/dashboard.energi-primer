import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

import {
  isAuthorizationPolicyError,
  requireAdminUser,
} from "@/lib/authorization";
import {
  AUDIT_LOG_ACTIONS,
  listAuditLogsAfterAdminGuard,
  parseAuditLogQuery,
  type AuditLogPage as AuditLogPageData,
  type AuditLogQuery,
} from "@/services/audit-log";

type AuditLogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildAuditLogHref(query: AuditLogQuery, page: number) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (query.pageSize !== 25) params.set("pageSize", String(query.pageSize));
  if (query.action !== "ALL") params.set("action", query.action);
  if (query.search) params.set("search", query.search);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const value = params.toString();
  return (value ? `/pengaturan/audit-log?${value}` : "/pengaturan/audit-log") as Route;
}

function accountLabel(account: AuditLogPageData["items"][number]["actor"]) {
  return account.name && account.name !== account.username
    ? `${account.name} (${account.username})`
    : account.username;
}

function accountStatusLabel(status: "ACTIVE" | "DISABLED") {
  return status === "ACTIVE" ? "Active" : "Disabled";
}

function AuditLogTable({ data }: { data: AuditLogPageData }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Activity records</h2>
            <p className="mt-1 text-xs text-slate-500">
              Menampilkan {data.items.length} record pada halaman {data.page}.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            Read-only
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-left text-sm">
          <caption className="sr-only">Audit log aktivitas user</caption>
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-5 py-3" scope="col">Waktu</th>
              <th className="px-5 py-3" scope="col">Actor</th>
              <th className="px-5 py-3" scope="col">Target</th>
              <th className="px-5 py-3" scope="col">Action</th>
              <th className="px-5 py-3" scope="col">Detail aman</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((item) => (
              <tr key={item.id} className="align-top hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-600">
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </td>
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-800">{accountLabel(item.actor)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {accountStatusLabel(item.actor.status)}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-800">{accountLabel(item.target)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {accountStatusLabel(item.target.status)}
                  </p>
                </td>
                <td className="whitespace-nowrap px-5 py-4">
                  <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                    {item.action}
                  </span>
                  <p className="mt-1 text-[11px] text-slate-500">{item.actionLabel}</p>
                </td>
                <td className="max-w-sm px-5 py-4 text-xs leading-5 text-slate-600">
                  {item.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">
            Tidak ada record audit yang cocok dengan filter.
          </p>
        ) : null}
      </div>
      <nav
        aria-label="Pagination audit log"
        className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"
      >
        <p className="text-xs text-slate-500">Urutan terbaru lebih dahulu.</p>
        <div className="flex items-center gap-2">
          {data.hasPreviousPage ? (
            <Link
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              href={buildAuditLogHref(data.query, data.page - 1)}
            >
              Sebelumnya
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-400">
              Sebelumnya
            </span>
          )}
          <span className="px-2 text-xs font-semibold text-slate-600">{data.page}</span>
          {data.hasNextPage ? (
            <Link
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              href={buildAuditLogHref(data.query, data.page + 1)}
            >
              Berikutnya
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-400">
              Berikutnya
            </span>
          )}
        </div>
      </nav>
    </section>
  );
}

function FilterForm({ query }: { query: AuditLogQuery }) {
  return (
    <form
      method="get"
      aria-label="Filter audit log"
      className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
    >
      <label className="text-xs font-bold text-slate-600">
        Action
        <select
          name="action"
          defaultValue={query.action}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        >
          <option value="ALL">Semua action</option>
          {AUDIT_LOG_ACTIONS.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-2">
        Actor atau target
        <input
          name="search"
          defaultValue={query.search}
          maxLength={100}
          placeholder="Cari username atau nama"
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </label>
      <label className="text-xs font-bold text-slate-600">
        Dari tanggal
        <input
          type="date"
          name="from"
          defaultValue={query.from}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </label>
      <label className="text-xs font-bold text-slate-600">
        Sampai tanggal
        <input
          type="date"
          name="to"
          defaultValue={query.to}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </label>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
        <button
          type="submit"
          className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2"
        >
          Terapkan filter
        </button>
        <Link
          href={"/pengaturan/audit-log" as Route}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  let data: AuditLogPageData;
  try {
    const current = await requireAdminUser();
    const rawSearchParams = searchParams ? await searchParams : {};
    void current;
    data = await listAuditLogsAfterAdminGuard(parseAuditLogQuery(rawSearchParams));
  } catch (error) {
    if (isAuthorizationPolicyError(error)) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/login?callbackUrl=/pengaturan/audit-log" as Route);
      }
      redirect("/dashboard?error=unauthorized" as Route);
    }
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-slate-500"
      >
        <Link href="/dashboard">Dashboard</Link>
        <span aria-hidden="true">/</span>
        <Link href="/pengaturan">Pengaturan</Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-sky-700">Audit Log</span>
      </nav>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
          Energi Primer
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Audit Log
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Riwayat perubahan akses akun. Halaman ini read-only dan hanya tersedia
          untuk administrator aktif.
        </p>
      </header>
      <FilterForm query={data.query} />
      <AuditLogTable data={data} />
    </div>
  );
}
