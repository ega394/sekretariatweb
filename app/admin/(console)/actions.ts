"use server";

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getIdentityProvider, IdentityConfigError } from "@/auth/identity";
import { clearSession, getCurrentUser, setSession } from "@/auth/session";
import { AuthorizationError } from "@/rbac/authorization";
import { DomainError } from "@/domain/errors";
import { createPerson } from "@/domain/services/person-service";
import { createAssignment, endAssignment } from "@/domain/services/assignment-service";
import { recordVerification } from "@/domain/services/verification-service";

const revalidate = (tags: string[]) => {
  tags.forEach((t) => revalidateTag(t));
};

/** Resolve the acting user or leave. Authorization is still checked in services. */
async function actor(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!user.userId) redirect("/admin");
  return user.userId;
}

function back(kind: "msg" | "error", text: string): never {
  redirect(`/admin?${kind}=${encodeURIComponent(text)}`);
}

/** Run a mutation; turn expected failures into a flash message (never swallow others). */
async function run(fn: () => Promise<string>): Promise<never> {
  let message: string;
  try {
    message = await fn();
  } catch (err) {
    if (err instanceof AuthorizationError) back("error", "Anda tidak memiliki izin untuk aksi ini.");
    if (err instanceof DomainError) back("error", err.message);
    throw err;
  }
  back("msg", message);
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = z
    .object({ email: z.string().trim().email(), password: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/login?error=" + encodeURIComponent("Email atau kata sandi tidak valid."));

  let result;
  try {
    result = await getIdentityProvider().signIn(parsed.data.email, parsed.data.password);
  } catch (err) {
    const msg =
      err instanceof IdentityConfigError
        ? err.message
        : "Layanan autentikasi tidak dapat dihubungi. Coba lagi nanti.";
    redirect("/admin/login?error=" + encodeURIComponent(msg));
  }
  if (!result) redirect("/admin/login?error=" + encodeURIComponent("Email atau kata sandi salah."));

  setSession(result.accessToken, result.expiresIn);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  clearSession();
  redirect("/admin/login");
}

export async function createPersonAction(formData: FormData): Promise<never> {
  const userId = await actor();
  const parsed = z
    .object({
      full_name: text(200),
      display_name: optText(200),
      honorific_prefix: optText(50),
      honorific_suffix: optText(100),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("error", "Nama lengkap wajib diisi.");
  const d = parsed.data;
  return run(async () => {
    await createPerson({
      actorUserId: userId,
      fullName: d.full_name,
      displayName: d.display_name,
      honorificPrefix: d.honorific_prefix,
      honorificSuffix: d.honorific_suffix,
    });
    return `Orang ditambahkan: ${d.full_name}. Belum tampil publik sampai diverifikasi.`;
  });
}

export async function createAssignmentAction(formData: FormData): Promise<never> {
  const userId = await actor();
  const parsed = z
    .object({
      person_id: z.string().uuid(),
      position_id: z.string().uuid(),
      assignment_type_code: z.enum(["definitif", "plt", "plh", "pj"]),
      start_date: dateStr,
      end_date: z.preprocess((v) => (v === "" ? undefined : v), dateStr.optional()),
      appointment_reference: optText(300),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("error", "Data penugasan tidak lengkap atau tidak valid.");
  const d = parsed.data;
  return run(async () => {
    await createAssignment(
      {
        actorUserId: userId,
        personId: d.person_id,
        positionId: d.position_id,
        assignmentTypeCode: d.assignment_type_code,
        startDate: d.start_date,
        endDate: d.end_date ?? null,
        appointmentReference: d.appointment_reference,
      },
      revalidate,
    );
    return "Penugasan ditambahkan. Belum tampil publik sampai diverifikasi.";
  });
}

export async function endAssignmentAction(formData: FormData): Promise<never> {
  const userId = await actor();
  const parsed = z
    .object({ assignment_id: z.string().uuid(), end_date: dateStr })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("error", "Tanggal berakhir tidak valid.");
  const d = parsed.data;
  return run(async () => {
    await endAssignment(userId, d.assignment_id, d.end_date, revalidate);
    return "Penugasan diakhiri.";
  });
}

export async function recordVerificationAction(formData: FormData): Promise<never> {
  const userId = await actor();
  const parsed = z
    .object({
      target: z.string().regex(/^(person|organization_unit|position|assignment):[0-9a-f-]{36}$/),
      status: z.enum(["needs_verification", "verified", "expired", "rejected"]),
      source_type: z.enum(["perwali", "sk", "portal_resmi", "media", "lainnya"]),
      source_reference: optText(500),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("error", "Data verifikasi tidak lengkap atau tidak valid.");
  const d = parsed.data;
  const [kind, id] = d.target.split(":") as [
    "person" | "organization_unit" | "position" | "assignment",
    string,
  ];
  return run(async () => {
    await recordVerification(
      {
        actorUserId: userId,
        target: { kind, id },
        status: d.status,
        sourceType: d.source_type,
        sourceReference: d.source_reference ?? undefined,
      },
      revalidate,
    );
    return "Verifikasi dicatat.";
  });
}
