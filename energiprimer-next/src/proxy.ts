import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";

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

function isLocalCspReportOnlyRequest(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  return (
    process.env.CSP_REPORT_ONLY === "true" &&
    (hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "::1")
  );
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function createLocalCsp() {
  const nonce = Buffer.from(globalThis.crypto.randomUUID()).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  return { nonce, policy };
}

function setLocalCspHeader(response: NextResponse, policy: string) {
  response.headers.set("Content-Security-Policy-Report-Only", policy);
  return response;
}

const protectedProxy = auth((request) => {
  const pathname = request.nextUrl.pathname;
  const localCsp = isLocalCspReportOnlyRequest(request)
    ? createLocalCsp()
    : null;

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
    const response = NextResponse.redirect(loginUrl);
    return localCsp
      ? setLocalCspHeader(response, localCsp.policy)
      : response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-dashboard-pathname", pathname);
  if (localCsp) {
    requestHeaders.set("x-nonce", localCsp.nonce);
  }
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

  return localCsp
    ? setLocalCspHeader(response, localCsp.policy)
    : response;
}) as unknown as NextMiddleware;

function localReportOnlyProxy(request: NextRequest) {
  const localCsp = createLocalCsp();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", localCsp.nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return setLocalCspHeader(response, localCsp.policy);
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;

  if (isLocalCspReportOnlyRequest(request)) {
    return isProtectedPath(pathname)
      ? protectedProxy(request, event)
      : localReportOnlyProxy(request);
  }

  return isProtectedPath(pathname)
    ? protectedProxy(request, event)
    : NextResponse.next();
}

export const config = {
  // The broad matcher is required only so the local controlled runtime can
  // attach a request-specific nonce to public HTML and Auth.js responses.
  // Production keeps the previous protected-path behavior in proxy().
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
