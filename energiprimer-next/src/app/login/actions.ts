"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { isValidAuthEmail, normalizeAuthEmail } from "@/lib/auth-security";

export type LoginState = {
  error?: string;
};

export async function authenticate(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normalizeAuthEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!isValidAuthEmail(email) || !password) {
    return { error: "Email atau password tidak valid." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email atau password tidak valid." };
    }

    throw error;
  }

  return {};
}
