import { NextResponse } from "next/server";

import { auth } from "@/auth";

const FILTER_COOKIES = [
  "dashboard_filter_month",
  "dashboard_filter_year",
  "dashboard_filter_day",
] as const;

export const proxy = auth((request) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-dashboard-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const { searchParams, pathname } = request.nextUrl;

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
