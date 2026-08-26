import Link from "next/link";

import { auth } from "@/auth";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  return <div className="mx-auto w-full max-w-4xl space-y-8"><nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500"><Link href="/dashboard">Dashboard</Link><span aria-hidden="true">/</span><span className="font-semibold text-sky-700">Pengaturan</span></nav><header><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Energi Primer</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Pengaturan Profil</h1><p className="mt-3 text-sm leading-6 text-slate-600">Kelola informasi akun dan password Anda.</p></header><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-slate-900">Profil Akun</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium text-slate-500">Nama Akun<input readOnly value={user?.name ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" /></label><label className="text-xs font-medium text-slate-500">Email<input readOnly value={user?.email ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" /></label></div><div className="mt-5 border-t border-slate-200 pt-5"><Link className="inline-flex rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" href="/password/change">Ubah Password</Link></div></section></div>;
}
