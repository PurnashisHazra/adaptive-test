const GUEST_ID_KEY = "adaptest_guest_id";
const GUEST_NAME_KEY = "adaptest_guest_display_name";

function randomSuffix(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing?.startsWith("guest_")) return existing;
    const id = `guest_${randomSuffix()}`;
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    return `guest_${randomSuffix()}`;
  }
}

export function getGuestId(): string | null {
  try {
    const v = localStorage.getItem(GUEST_ID_KEY);
    return v?.startsWith("guest_") ? v : null;
  } catch {
    return null;
  }
}

export function getGuestDisplayName(): string {
  try {
    return localStorage.getItem(GUEST_NAME_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setGuestDisplayName(name: string): void {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name.trim().slice(0, 120));
  } catch {
    /* ignore */
  }
}

export function clearGuestSession(): void {
  try {
    localStorage.removeItem(GUEST_ID_KEY);
    localStorage.removeItem(GUEST_NAME_KEY);
  } catch {
    /* ignore */
  }
}

export function isGuestModeActive(): boolean {
  return Boolean(getGuestId());
}
