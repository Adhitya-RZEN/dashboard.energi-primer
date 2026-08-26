import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";

import { consumeLoginAttempt, getRequestIp } from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
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
        const email = typeof credentials?.email === "string"
          ? credentials.email.trim().toLowerCase()
          : "";
        const password = typeof credentials?.password === "string"
          ? credentials.password
          : "";

        if (!email || !password) {
          return null;
        }

        const requestHeaders = await headers();
        const throttle = await consumeLoginAttempt(
          email,
          getRequestIp(requestHeaders.get("x-forwarded-for"), requestHeaders.get("x-real-ip")),
        );
        if (!throttle.allowed) return null;

        const user = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
            role: "admin",
          },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
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
        return session?.user?.role === "admin";
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = typeof token.role === "string" ? token.role : "";
      }

      if (session.user && token.sub && token.sessionVersion && /^\d+$/.test(token.sub)) {
        const currentUser = await prisma.user.findUnique({
          where: { id: BigInt(token.sub) },
          select: { updatedAt: true },
        });
        if ((currentUser?.updatedAt?.toISOString() ?? "") !== token.sessionVersion) {
          session.user.role = "";
        }
      }

      return session;
    },
  },
});
