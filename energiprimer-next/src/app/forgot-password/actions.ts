"use server";

import bcrypt from "bcryptjs";

import { isValidAuthEmail, normalizeAuthEmail } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";
import {
  createPasswordResetToken,
  createRememberToken,
  deliverPasswordResetEmail,
  isPasswordResetExpired,
  isPasswordResetThrottled,
} from "@/lib/password-reset";

const GENERIC_MESSAGE =
  "Jika email tersebut terdaftar sebagai akun admin, instruksi reset password telah dikirim.";

export type PasswordResetRequestState = {
  message?: string;
  error?: string;
};

export async function requestPasswordReset(
  _previousState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const email = normalizeAuthEmail(formData.get("email"));

  if (!isValidAuthEmail(email)) {
    return { error: "Masukkan alamat email yang valid." };
  }

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      role: "admin",
    },
    select: { email: true },
  });

  if (!user) {
    return { message: GENERIC_MESSAGE };
  }

  const existingToken = await prisma.passwordResetToken.findUnique({
    where: { email: user.email },
    select: { createdAt: true },
  });

  if (
    existingToken?.createdAt &&
    isPasswordResetThrottled(existingToken.createdAt)
  ) {
    return { message: GENERIC_MESSAGE };
  }

  const token = createPasswordResetToken();
  const tokenHash = await bcrypt.hash(token, 12);

  await prisma.passwordResetToken.upsert({
    where: { email: user.email },
    create: { email: user.email, token: tokenHash, createdAt: new Date() },
    update: { token: tokenHash, createdAt: new Date() },
  });

  try {
    await deliverPasswordResetEmail(user.email, token);
  } catch {
    console.error("Password reset delivery is unavailable.");
  }

  return { message: GENERIC_MESSAGE };
}

export type ResetPasswordState = {
  message?: string;
  error?: string;
};

export async function resetPassword(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const email = normalizeAuthEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(
    formData.get("password_confirmation") ?? "",
  );

  if (!token || !isValidAuthEmail(email)) {
    return { error: "Link reset password tidak valid atau sudah kedaluwarsa." };
  }

  if (password.length < 12 || password !== passwordConfirmation) {
    return {
      error: "Password minimal 12 karakter dan harus dikonfirmasi ulang.",
    };
  }

  const resetRecord = await prisma.passwordResetToken.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (
    !resetRecord?.createdAt ||
    isPasswordResetExpired(resetRecord.createdAt) ||
    !(await bcrypt.compare(token, resetRecord.token))
  ) {
    return { error: "Link reset password tidak valid atau sudah kedaluwarsa." };
  }

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      role: "admin",
    },
    select: { id: true },
  });

  if (!user) {
    return { error: "Link reset password tidak valid atau sudah kedaluwarsa." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        rememberToken: createRememberToken(),
        updatedAt: new Date(),
      },
    }),
    prisma.passwordResetToken.delete({ where: { email: resetRecord.email } }),
  ]);

  return {
    message: "Password berhasil direset. Silakan login dengan password baru.",
  };
}
