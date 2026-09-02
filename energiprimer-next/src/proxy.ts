import { NextResponse } from "next/server";

import { auth } from "@/auth";

const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/data-batu-bara",
  "/laporan",
  "/monitoring",
  "/pengaturan",
  "/password/change",
] as const;

const FILTER_COOKIES = [
  "dashboard_filter_month",
  "dashboard_filter_year",
  "dashboard_filter_day",
] as const;

function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const proxy = auth((request) => {
  const pathname = request.nextUrl.pathname;

  // A custom auth() callback owns the response path. The Auth.js
  // callbacks.authorized result is not applied after this callback runs, so
  // reject unauthenticated/non-admin requests before any protected layout or
  // dashboard child can render.
  if (isProtectedPath(pathname) && request.auth?.user?.role !== "admin") {
    const loginUrl = new URL("/login", request.url);
    if (request.auth?.user) {
      loginUrl.searchParams.set("error", "unauthorized");
    } else {
      loginUrl.searchParams.set(
        "callbackUrl",
        `${pathname}${request.nextUrl.search}`,
      );
    }
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-dashboard-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const { searchParams } = request.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    if (searchParams.get("reset") === "1") {
      FILTER_COOKIES.forEach((name) => response.cookies.delete(name));
    } else {
      const paramsToCookie: Array<
        [(typeof FILTER_COOKIES)[number], string | null]
      > = [
        ["dashboard_filter_month", searchParams.get("month")],
        ["dashboard_filter_year", searchParams.get("year")],
        [
          "dashboard_filter_day",
          searchParams.has("day") ? searchParams.get("day") : null,
        ],
      ];
      paramsToCookie.forEach(([name, value]) => {
        if (value !== null) {
          response.cookies.set(name, value, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30,
            path: "/",
          });
        }
      });
    }
  }

  return response;
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
