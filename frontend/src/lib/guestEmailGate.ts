export const GUEST_EMAIL_REQUIRED = "Guest email required";

export function isGuestEmailRequiredError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("response" in err)) return false;
  const res = (err as { response?: { status?: number; data?: { detail?: string } } }).response;
  return res?.status === 403 && res?.data?.detail === GUEST_EMAIL_REQUIRED;
}
