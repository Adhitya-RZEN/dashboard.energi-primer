import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "@prisma/client";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";
import "server-only";

import {
  isValidAuthEmail,
  normalizeAuthEmail,
  resolveSafeRedirect,
} from "@/lib/auth-security";
import { consumeLoginAttempt, getRequestIp } from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";
import { isDashboardRole } from "@/lib/authorization-policy";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 120 * 60,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = normalizeAuthEmail(credentials?.email);
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!isValidAuthEmail(email) || !password) {
          return null;
        }

        const requestHeaders = await headers();
        const throttle = await consumeLoginAttempt(
          email,
          getRequestIp(
            requestHeaders.get("x-forwarded-for"),
            requestHeaders.get("x-real-ip"),
          ),
        );
        if (!throttle.allowed) return null;

        const user = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
            role: { in: [UserRole.ADMIN, UserRole.USER] },
            status: UserStatus.ACTIVE,
          },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            status: true,
            updatedAt: true,
          },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.updatedAt?.toISOString() ?? "",
        };
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session, request }) {
      if (request.nextUrl.pathname.startsWith("/dashboard")) {
        return isDashboardRole(session?.user?.role);
      }

      return true;
    },
    redirect({ url, baseUrl }) {
      return resolveSafeRedirect(url, baseUrl);
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      }

      return token;
    },
    async session({ session, token }) {
      const subject = typeof token.sub === "string" ? token.sub : "";

      if (session.user && subject) {
        session.user.id = subject;
        session.user.role = isDashboardRole(token.role) ? token.role : "";
      }

      if (session.user && /^\d+$/.test(subject)) {
        const currentUser = await prisma.user.findUnique({
          where: { id: BigInt(subject) },
          select: { role: true, status: true, updatedAt: true },
        });

        const currentVersion = currentUser?.updatedAt?.toISOString() ?? "";
        const tokenVersion =
          typeof token.sessionVersion === "string" ? token.sessionVersion : null;
        const tokenRole = isDashboardRole(token.role) ? token.role : null;

        if (
          !currentUser ||
          currentUser.status !== UserStatus.ACTIVE ||
          !isDashboardRole(currentUser.role) ||
          tokenRole === null ||
          currentUser.role !== tokenRole ||
          tokenVersion === null ||
          currentVersion !== tokenVersion
        ) {
          session.user.role = "";
        } else {
          session.user.role = currentUser.role;
        }
      }

      return session;
    },
  },
});
