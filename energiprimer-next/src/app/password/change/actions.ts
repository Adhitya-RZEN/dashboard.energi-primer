"use server";

import bcrypt from "bcryptjs";

import { auth, signOut } from "@/auth";
import { createRememberToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";

export type ChangePasswordState = {
  error?: string;
};

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return { error: "Sesi tidak valid. Silakan login kembali." };
  }

  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(
    formData.get("password_confirmation") ?? "",
  );

  if (!currentPassword) return { error: "Password saat ini wajib diisi." };
  if (password.length < 12)
    return { error: "Password baru minimal 12 karakter." };
  if (password !== passwordConfirmation)
    return { error: "Konfirmasi password tidak cocok." };

  if (!/^\d+$/.test(session.user.id)) {
    return { error: "Sesi tidak valid. Silakan login kembali." };
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(session.user.id) },
    select: { password: true },
  });

  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return { error: "Password saat ini tidak cocok." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: BigInt(session.user.id) },
    data: {
      password: passwordHash,
      rememberToken: createRememberToken(),
      updatedAt: new Date(),
    },
  });

  // Clear the active browser session. The auth token version check in auth.ts
  // rejects other JWTs issued before this password change.
  await signOut({ redirectTo: "/login?status=password-changed" });
  return {};
}
