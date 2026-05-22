/** Indian-style 10-digit mobile stored on student account. */
export function hasValidMobile(mobile: string | null | undefined): boolean {
  const digits = String(mobile ?? "").replace(/\D/g, "");
  return digits.length === 10;
}
