"use client";

import type { FormEvent, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useActionState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import {
  changeStatus,
  changeRole,
  createUser,
  resetPassword,
} from "@/app/(protected)/pengaturan/users/actions";
import {
  validateCreateUserInput,
  type CreateUserFieldErrors,
  type PasswordResetFieldErrors,
  validatePasswordResetInput,
} from "@/lib/user-management-validation";

import type {
  UserManagementRole,
  UserManagementStatus,
  UserManagementUser,
} from "./types";

type RoleFilter = "ALL" | UserManagementRole;
type StatusFilter = "ALL" | UserManagementStatus;
type DialogName =
  | "add"
  | "edit"
  | "reset-password"
  | "change-role"
  | "status"
  | null;
type StatusAction = "ENABLE_USER" | "DISABLE_USER";
type RowAction = Exclude<DialogName, "add" | "status" | null> | "status";

const initialCreateUserState = { status: "idle" as const };
const initialResetPasswordState = { status: "idle" as const };
const initialChangeRoleState = { status: "idle" as const };
const initialChangeStatusState = { status: "idle" as const };

const inputClassName =
  "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100";
const selectClassName =
  "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function RoleBadge({ role }: { role: UserManagementRole }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        role === "ADMIN"
          ? "bg-violet-50 text-violet-700"
          : "bg-sky-50 text-sky-700"
      }`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: UserManagementStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
        status === "ACTIVE"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${
          status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {status === "ACTIVE" ? "Active" : "Disabled"}
    </span>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-xs font-medium text-red-700">
      {message}
    </p>
  ) : null;
}

type TextFieldProps = {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "email" | "password" | "text";
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

function TextField({
  id,
  name,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  error,
  required = false,
  disabled = false,
}: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-slate-600">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-red-600">
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${inputClassName} ${error ? "border-red-400 focus:border-red-500 focus:ring-red-100" : ""}`}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function PhaseNotice({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900"
      role="note"
    >
      <strong>Presentation only:</strong> {children}
    </div>
  );
}

type DialogShellProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
};

function DialogShell({
  title,
  description,
  onClose,
  children,
  size = "md",
}: DialogShellProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      "[data-dialog-autofocus], " + focusableSelector,
    );
    firstFocusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-950/40"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${size === "lg" ? "max-w-2xl" : "max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-950">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-xs leading-5 text-slate-500"
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            data-dialog-autofocus
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

function DialogFooter({
  onClose,
  submitLabel,
  disabled = false,
}: {
  onClose: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
      <button
        type="button"
        className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        onClick={onClose}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {submitLabel}
      </button>
    </div>
  );
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

type AddUserForm = {
  username: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: UserManagementRole;
};

function AddUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<AddUserForm>({
    username: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "USER",
  });
  const [errors, setErrors] = useState<CreateUserFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    createUser,
    initialCreateUserState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onCreated();
    }
  }, [onCreated, state.status]);

  const displayErrors = {
    ...(pending || state.status !== "error" ? {} : state.fieldErrors),
    ...errors,
  };
  const displayNotice =
    pending || state.status !== "error"
      ? notice
      : state.message ?? notice ?? "Unable to create user.";

  function updateField<K extends keyof AddUserForm>(
    field: K,
    value: AddUserForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }

    const validation = validateCreateUserInput(form);
    setErrors(validation.fieldErrors);
    setNotice(
      validation.valid ? null : "Please correct the highlighted fields.",
    );
    if (!validation.valid) event.preventDefault();
  }

  return (
    <DialogShell
      title="Add New User"
      description="Create an active application account for a new user."
      onClose={onClose}
      size="lg"
    >
      <form
        className="space-y-5"
        action={formAction}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="add-user-username"
            name="username"
            label="Username"
            value={form.username}
            onChange={(value) => updateField("username", value)}
            error={displayErrors.username}
            disabled={pending}
            required
          />
          <TextField
            id="add-user-name"
            name="name"
            label="Name"
            value={form.name}
            onChange={(value) => updateField("name", value)}
            error={displayErrors.name}
            disabled={pending}
            required
          />
        </div>
        <TextField
          id="add-user-email"
          name="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={(value) => updateField("email", value)}
          error={displayErrors.email}
          autoComplete="email"
          disabled={pending}
          required
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="add-user-password"
            name="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={(value) => updateField("password", value)}
            error={displayErrors.password}
            autoComplete="new-password"
            disabled={pending}
            required
          />
          <TextField
            id="add-user-confirm-password"
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            value={form.confirmPassword}
            onChange={(value) => updateField("confirmPassword", value)}
            error={displayErrors.confirmPassword}
            autoComplete="new-password"
            disabled={pending}
            required
          />
        </div>
        <div>
          <label
            htmlFor="add-user-role"
            className="text-xs font-bold text-slate-600"
          >
            Role
          </label>
          <select
            id="add-user-role"
            name="role"
            className={selectClassName}
            value={form.role}
            disabled={pending}
            onChange={(event) =>
              updateField("role", event.target.value as UserManagementRole)
            }
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        {displayNotice ? (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900"
            role="status"
          >
            {displayNotice}
          </p>
        ) : null}
        <PhaseNotice>
          the server validates and normalizes these fields, hashes the
          password, and records the creation audit event transactionally.
        </PhaseNotice>
        <DialogFooter
          onClose={onClose}
          submitLabel={pending ? "Creating..." : "Create User"}
          disabled={pending}
        />
      </form>
    </DialogShell>
  );
}

type EditUserForm = Pick<UserManagementUser, "username" | "name" | "email">;

function EditUserDialog({
  user,
  onClose,
}: {
  user: UserManagementUser;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditUserForm>({
    username: user.username,
    name: user.name,
    email: user.email,
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof EditUserForm, string>>
  >({});
  const [notice, setNotice] = useState<string | null>(null);

  function updateField<K extends keyof EditUserForm>(
    field: K,
    value: EditUserForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof EditUserForm, string>> = {};
    if (!form.username.trim()) nextErrors.username = "Username required";
    if (!form.name.trim()) nextErrors.name = "Name required";
    if (!validateEmail(form.email)) nextErrors.email = "Valid email required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setNotice("No changes were saved. User updates are deferred to a later phase.");
  }

  return (
    <DialogShell
      title="Edit User"
      description={`Review profile details for ${user.name}.`}
      onClose={onClose}
      size="lg"
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="edit-user-username"
            label="Username"
            value={form.username}
            onChange={(value) => updateField("username", value)}
            error={errors.username}
            required
          />
          <TextField
            id="edit-user-name"
            label="Name"
            value={form.name}
            onChange={(value) => updateField("name", value)}
            error={errors.name}
            required
          />
        </div>
        <TextField
          id="edit-user-email"
          label="Email"
          type="email"
          value={form.email}
          onChange={(value) => updateField("email", value)}
          error={errors.email}
          required
        />
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Role
            </p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Status
            </p>
            <div className="mt-2">
              <StatusBadge status={user.status} />
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
            Role and status are read-only here. Their dedicated presentation
            actions do not save changes in Phase 4.
          </p>
        </div>
        {notice ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900" role="status">
            {notice}
          </p>
        ) : null}
        <PhaseNotice>
          this profile form is presentation-only. No user profile changes will
          be persisted.
        </PhaseNotice>
        <DialogFooter onClose={onClose} submitLabel="Save changes" />
      </form>
    </DialogShell>
  );
}

type PasswordForm = {
  newPassword: string;
  confirmPassword: string;
};

function ResetPasswordDialog({
  user,
  onClose,
  onCompleted,
}: {
  user: UserManagementUser;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [form, setForm] = useState<PasswordForm>({
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<PasswordResetFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    resetPassword,
    initialResetPasswordState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onCompleted();
    }
  }, [onCompleted, state.status]);

  const displayErrors = {
    ...(pending || state.status !== "error" ? {} : state.fieldErrors),
    ...errors,
  };
  const displayNotice =
    pending || state.status !== "error"
      ? notice
      : state.message ?? notice ?? "Unable to reset password.";

  function updateField<K extends keyof PasswordForm>(
    field: K,
    value: PasswordForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }

    const validation = validatePasswordResetInput(form);
    setErrors(validation.fieldErrors);
    setNotice(
      validation.valid ? null : "Please correct the highlighted fields.",
    );
    if (!validation.valid) event.preventDefault();
  }

  return (
    <DialogShell
      title="Reset Password"
      description="Set a new password for this user. Existing sessions will be invalidated."
      onClose={onClose}
    >
      <form
        className="space-y-5"
        action={formAction}
        onSubmit={handleSubmit}
        noValidate
      >
        <input type="hidden" name="targetUserId" value={user.id} />
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            User
          </p>
          <p className="mt-2 text-sm font-bold text-slate-900">{user.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {user.username} · {user.email}
          </p>
        </div>
        <TextField
          id="reset-user-password"
          name="newPassword"
          label="New Password"
          type="password"
          value={form.newPassword}
          onChange={(value) => updateField("newPassword", value)}
          error={displayErrors.newPassword}
          autoComplete="new-password"
          disabled={pending}
          required
        />
        <TextField
          id="reset-user-confirm-password"
          name="confirmPassword"
          label="Confirm Password"
          type="password"
          value={form.confirmPassword}
          onChange={(value) => updateField("confirmPassword", value)}
          error={displayErrors.confirmPassword}
          autoComplete="new-password"
          disabled={pending}
          required
        />
        {displayNotice ? (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900"
            role="status"
          >
            {displayNotice}
          </p>
        ) : null}
        <PhaseNotice>
          the server validates and hashes the new password, updates the
          security version, and records a password-reset audit transactionally.
        </PhaseNotice>
        <DialogFooter
          onClose={onClose}
          submitLabel={pending ? "Resetting..." : "Reset Password"}
          disabled={pending}
        />
      </form>
    </DialogShell>
  );
}

function ChangeRoleDialog({
  user,
  onClose,
  onCompleted,
}: {
  user: UserManagementUser;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const nextDefaultRole: UserManagementRole =
    user.role === "ADMIN" ? "USER" : "ADMIN";
  const [nextRole, setNextRole] = useState<UserManagementRole>(nextDefaultRole);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    changeRole,
    initialChangeRoleState,
  );
  const protectedTarget = Boolean(
    user.isCurrentUser || user.isProtectedAdministrator,
  );

  useEffect(() => {
    if (state.status === "success") {
      onCompleted();
    }
  }, [onCompleted, state.status]);

  const displayNotice =
    pending || state.status !== "error"
      ? notice
      : state.message ?? notice ?? "Unable to change user role.";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    if (protectedTarget) {
      event.preventDefault();
      setNotice("This administrator target is protected by the security policy.");
      return;
    }
    if (nextRole === user.role) {
      event.preventDefault();
      setNotice("Choose a different role.");
      return;
    }
    setNotice(null);
  }

  return (
    <DialogShell
      title="Change Role"
      description="Update this user's application role."
      onClose={onClose}
    >
      <form
        className="space-y-5"
        action={formAction}
        onSubmit={handleSubmit}
        noValidate
      >
        <input type="hidden" name="targetUserId" value={user.id} />
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            User
          </p>
          <p className="mt-2 text-sm font-bold text-slate-900">{user.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {user.username} · {user.email}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <RoleBadge role={user.role} />
            <StatusBadge status={user.status} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-slate-600">Current role</p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
          </div>
          <div>
            <label
              htmlFor="change-user-role"
              className="text-xs font-bold text-slate-600"
            >
              New role
            </label>
            <select
              id="change-user-role"
              name="newRole"
              className={selectClassName}
              value={nextRole}
              disabled={pending || protectedTarget}
              onChange={(event) =>
                setNextRole(event.target.value as UserManagementRole)
              }
            >
              <option value="ADMIN">ADMIN</option>
              <option value="USER">USER</option>
            </select>
          </div>
        </div>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
          Changing this user&apos;s role changes their application access.
        </p>
        {protectedTarget ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
            Protected administrator: changing this target&apos;s role is not
            offered by the UI.
          </p>
        ) : null}
        {displayNotice ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900" role="status">
            {displayNotice}
          </p>
        ) : null}
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900">
          The server rechecks authorization and the target&apos;s current role.
          A successful role change invalidates the target&apos;s existing session.
        </p>
        <DialogFooter
          onClose={onClose}
          submitLabel={pending ? "Updating..." : "Change Role"}
          disabled={pending || protectedTarget}
        />
      </form>
    </DialogShell>
  );
}

function UserStatusDialog({
  user,
  action,
  onClose,
  onCompleted,
}: {
  user: UserManagementUser;
  action: StatusAction;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const isDisable = action === "DISABLE_USER";
  const protectedTarget = Boolean(
    isDisable && (user.isCurrentUser || user.isProtectedAdministrator),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    changeStatus,
    initialChangeStatusState,
  );
  const verb = isDisable ? "Disable User" : "Enable User";

  useEffect(() => {
    if (state.status === "success") {
      onCompleted();
    }
  }, [onCompleted, state.status]);

  const displayNotice =
    pending || state.status !== "error"
      ? notice
      : state.message ?? notice ?? "Unable to update account status.";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    if (protectedTarget) {
      setNotice("This administrator target is protected by the security policy.");
      event.preventDefault();
      return;
    }
    setNotice(null);
  }

  return (
    <DialogShell
      title={`${verb}?`}
      description={`Review access for ${user.name}.`}
      onClose={onClose}
    >
      <form
        className="space-y-5"
        action={formAction}
        onSubmit={handleSubmit}
      >
        <input type="hidden" name="targetUserId" value={user.id} />
        <input
          type="hidden"
          name="desiredStatus"
          value={isDisable ? "DISABLED" : "ACTIVE"}
        />
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-900">{user.name}</p>
          <p className="mt-1 text-xs text-slate-500">{user.email}</p>
          <div className="mt-3">
            <StatusBadge status={user.status} />
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-700">
          {isDisable
            ? `${user.name} will no longer be able to access the application.`
            : `${user.name} will be allowed to access the application again.`}
        </p>
        {protectedTarget ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
            Protected administrator: this destructive action is not offered by
            the UI.
          </p>
        ) : null}
        {displayNotice ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900" role="status">
            {displayNotice}
          </p>
        ) : null}
        <PhaseNotice>
          the server rechecks the target&apos;s current status and administrator
          policy. A successful status change invalidates the target&apos;s
          existing session.
        </PhaseNotice>
        <DialogFooter
          onClose={onClose}
          submitLabel={pending ? "Updating..." : verb}
          disabled={pending || protectedTarget}
        />
      </form>
    </DialogShell>
  );
}

type UserActionMenuProps = {
  user: UserManagementUser;
  onSelect: (
    action: RowAction,
    user: UserManagementUser,
    statusAction?: StatusAction,
  ) => void;
};

function UserActionMenu({ user, onSelect }: UserActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const protectedTarget = Boolean(
    user.isCurrentUser || user.isProtectedAdministrator,
  );
  const menuWidth = 208;
  const menuGap = 8;
  const viewportPadding = 8;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const width = menuRect?.width || menuWidth;
    const height = menuRect?.height || 220;
    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - width - viewportPadding,
    );
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.right - width),
      maxLeft,
    );
    const opensBelow =
      triggerRect.bottom + menuGap + height <=
      window.innerHeight - viewportPadding;
    const top = opensBelow
      ? triggerRect.bottom + menuGap
      : Math.max(viewportPadding, triggerRect.top - height - menuGap);

    setMenuPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setMenuPosition(null);
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuPosition(null);
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  function select(
    action: RowAction,
    statusAction?: StatusAction,
  ) {
    setMenuPosition(null);
    setIsOpen(false);
    onSelect(action, user, statusAction);
  }

  const actionClassName =
    "block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50";
  const menu =
    isOpen ? (
      <div
        ref={menuRef}
        role="menu"
        aria-label={"Actions for " + user.name}
        className="z-[60] w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        style={{
          position: "fixed",
          top: menuPosition?.top ?? 0,
          left: menuPosition?.left ?? 0,
          visibility: menuPosition ? "visible" : "hidden",
        }}
      >
        <button
          type="button"
          className={actionClassName}
          onClick={() => select("edit")}
        >
          Edit User
        </button>
        {!user.isCurrentUser ? (
          <button
            type="button"
            className={actionClassName}
            onClick={() => select("reset-password")}
          >
            Reset Password
          </button>
        ) : null}
        {!protectedTarget ? (
          <button
            type="button"
            className={actionClassName}
            onClick={() => select("change-role")}
          >
            Change Role
          </button>
        ) : null}
        {!protectedTarget || user.status === "DISABLED" ? (
          <button
            type="button"
            className={actionClassName}
            onClick={() =>
              select(
                "status",
                user.status === "ACTIVE" ? "DISABLE_USER" : "ENABLE_USER",
              )
            }
          >
            {user.status === "ACTIVE" ? "Disable User" : "Enable User"}
          </button>
        ) : null}
        {protectedTarget ? (
          <p className="px-3 py-2 text-[11px] leading-4 text-slate-400">
            Protected administrator
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={"Actions for " + user.name}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-lg font-bold leading-none text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        onClick={(event) => {
          event.stopPropagation();
          setMenuPosition(null);
          setIsOpen((open) => !open);
        }}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : null}
    </>
  );
}

function UserTable({
  users,
  totalUsers,
  hasFilters,
  onClearFilters,
  onAddUser,
  onSelect,
}: {
  users: UserManagementUser[];
  totalUsers: number;
  hasFilters: boolean;
  onClearFilters: () => void;
  onAddUser: () => void;
  onSelect: UserActionMenuProps["onSelect"];
}) {
  if (users.length === 0) {
    return (
      <div className="border-t border-slate-200 px-5 py-14 text-center sm:px-6">
        <p className="text-base font-bold text-slate-900">
          {totalUsers === 0 ? "No users yet" : "No users found"}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          {totalUsers === 0
            ? "Create the first user to get started."
            : "There are no users matching your current filters."}
        </p>
        {totalUsers === 0 ? (
          <button
            type="button"
            className="mt-5 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            onClick={onAddUser}
          >
            Add User
          </button>
        ) : hasFilters ? (
          <button
            type="button"
            className="mt-5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            onClick={onClearFilters}
          >
            Clear Filters
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full text-left text-xs">
        <caption className="sr-only">Application users</caption>
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-bold">
              Username
            </th>
            <th scope="col" className="px-4 py-3 font-bold">
              Name
            </th>
            <th scope="col" className="px-4 py-3 font-bold">
              Email
            </th>
            <th scope="col" className="px-4 py-3 font-bold">
              Role
            </th>
            <th scope="col" className="px-4 py-3 font-bold">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right font-bold">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((user) => (
            <tr key={user.id} className="text-slate-700 transition hover:bg-slate-50/70">
              <td className="px-4 py-4 font-semibold text-slate-900">
                {user.username}
              </td>
              <td className="px-4 py-4">
                <div className="font-semibold text-slate-900">{user.name}</div>
                {user.isCurrentUser ? (
                  <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    Current Admin
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-4 text-slate-600">{user.email}</td>
              <td className="px-4 py-4">
                <RoleBadge role={user.role} />
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={user.status} />
              </td>
              <td className="px-4 py-4 text-right">
                <UserActionMenu user={user} onSelect={onSelect} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UserManagementErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="rounded-2xl border border-red-200 bg-red-50 p-6 sm:p-8"
      role="alert"
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
        User data error
      </p>
      <h2 className="mt-2 text-xl font-bold text-red-950">
        Unable to load users.
      </h2>
      <p className="mt-2 text-sm leading-6 text-red-900/80">
        The user list could not be loaded. No database details are shown.
      </p>
      <button
        type="button"
        className="mt-5 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
        onClick={onRetry}
      >
        Try Again
      </button>
    </section>
  );
}

export function UserManagementClient({
  users,
}: {
  users: UserManagementUser[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedUser, setSelectedUser] = useState<UserManagementUser | null>(
    null,
  );
  const [activeDialog, setActiveDialog] = useState<DialogName>(null);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    setSelectedUser(null);
    setStatusAction(null);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  }, []);

  function openAddDialog() {
    setFeedback(null);
    setSelectedUser(null);
    setStatusAction(null);
    setActiveDialog("add");
  }

  function openRowDialog(
    action: RowAction,
    user: UserManagementUser,
    nextStatusAction?: StatusAction,
  ) {
    setSelectedUser(user);
    setStatusAction(action === "status" ? nextStatusAction ?? null : null);
    setActiveDialog(action);
  }

  const handleUserCreated = useCallback(() => {
    closeDialog();
    setFeedback("User created successfully.");
    router.refresh();
  }, [closeDialog, router]);

  const handlePasswordReset = useCallback(() => {
    closeDialog();
    setFeedback("Password reset successfully.");
    router.refresh();
  }, [closeDialog, router]);

  const handleRoleChanged = useCallback(() => {
    closeDialog();
    setFeedback("Role updated successfully.");
    router.refresh();
  }, [closeDialog, router]);

  const handleStatusChanged = useCallback(() => {
    const wasDisable = statusAction === "DISABLE_USER";
    closeDialog();
    setFeedback(
      wasDisable
        ? "User disabled successfully."
        : "User enabled successfully.",
    );
    router.refresh();
  }, [closeDialog, router, statusAction]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !normalizedSearch ||
      [user.username, user.name, user.email].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      );
    const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "ALL" || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });
  const hasFilters = Boolean(
    searchQuery.trim() || roleFilter !== "ALL" || statusFilter !== "ALL",
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-slate-500"
      >
        <Link className="transition hover:text-sky-700" href="/dashboard">
          Dashboard
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-sky-700">User Management</span>
      </nav>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
            Energi Primer
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            User Management
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Manage application users and their access.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex w-fit items-center justify-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          onClick={openAddDialog}
        >
          <span aria-hidden="true" className="mr-2 text-base leading-none">
            +
          </span>
          Add User
        </button>
      </header>

      {feedback ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
          aria-live="polite"
        >
          {feedback}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Users</h2>
              <p className="mt-1 text-xs text-slate-500">
                {filteredUsers.length} of {users.length} user
                {users.length === 1 ? "" : "s"} shown
              </p>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Role and status controls are server-authorized
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px] lg:px-6">
          <div>
            <label htmlFor="user-search" className="text-xs font-bold text-slate-600">
              Search users
            </label>
            <input
              id="user-search"
              type="search"
              value={searchQuery}
              placeholder="Search users..."
              className={inputClassName}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="role-filter" className="text-xs font-bold text-slate-600">
              Role
            </label>
            <select
              id="role-filter"
              value={roleFilter}
              className={selectClassName}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
            >
              <option value="ALL">All</option>
              <option value="ADMIN">Admin</option>
              <option value="USER">User</option>
            </select>
          </div>
          <div>
            <label htmlFor="status-filter" className="text-xs font-bold text-slate-600">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              className={selectClassName}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>
        </div>

        <UserTable
          users={filteredUsers}
          totalUsers={users.length}
          hasFilters={hasFilters}
          onClearFilters={clearFilters}
          onAddUser={openAddDialog}
          onSelect={openRowDialog}
        />
      </section>

      {activeDialog === "add" ? (
        <AddUserDialog
          onClose={closeDialog}
          onCreated={handleUserCreated}
        />
      ) : null}
      {activeDialog === "edit" && selectedUser ? (
        <EditUserDialog user={selectedUser} onClose={closeDialog} />
      ) : null}
      {activeDialog === "reset-password" && selectedUser ? (
        <ResetPasswordDialog
          user={selectedUser}
          onClose={closeDialog}
          onCompleted={handlePasswordReset}
        />
      ) : null}
      {activeDialog === "change-role" && selectedUser ? (
        <ChangeRoleDialog
          user={selectedUser}
          onClose={closeDialog}
          onCompleted={handleRoleChanged}
        />
      ) : null}
      {activeDialog === "status" && selectedUser && statusAction ? (
        <UserStatusDialog
          user={selectedUser}
          action={statusAction}
          onClose={closeDialog}
          onCompleted={handleStatusChanged}
        />
      ) : null}
    </div>
  );
}
