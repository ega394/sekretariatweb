/** Domain-level errors surfaced to callers (mapped from DB constraint faults). */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Maps a PostgreSQL error to a domain error without duplicating DB rules. */
export function mapPgError(err: unknown): DomainError | null {
  const e = err as { code?: string; constraint?: string } | undefined;
  if (!e?.code) return null;
  switch (e.code) {
    case "23P01": // exclusion_violation → assignment overlap (Phase 3D.1)
      return new DomainError(
        "Penugasan bertindih: sudah ada pejabat aktif pada jabatan ini.",
        "assignment_overlap",
      );
    case "23514": // check_violation
      return new DomainError("Data melanggar aturan integritas.", "check_violation");
    case "23503": // foreign_key_violation
      return new DomainError("Referensi data tidak ditemukan.", "fk_violation");
    default:
      return null;
  }
}
