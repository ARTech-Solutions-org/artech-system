// Drizzle wraps driver errors, so the Postgres code may be on the error itself or on its cause.
export function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ((e as { code?: string }).code === "23505") return true;
  return isUniqueViolation((e as { cause?: unknown }).cause);
}
