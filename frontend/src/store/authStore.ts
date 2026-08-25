import { create } from "zustand";
import type { AuthResponse, AuthUser, Role } from "../api/types";
import { claimAdminCode, getAuthMe, login, signup } from "../api/client";
import { clearGuestSession } from "../lib/guestSession";

export interface AuthSession {
  username: string;
  role: Role;
  needsAdminCode: boolean;
  assignedAdminCode?: string | null;
  adminCode?: string | null;
}

interface AuthState {
  isHydrated: boolean;
  token: string | null;
  session: AuthSession | null;
  role: Role | null;
  needsAdminCode: boolean;

  hydrate: () => void;
  refreshMe: () => Promise<void>;
  loginUser: (args: { username: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  signupUser: (args: { username: string; password: string; mobile: string }) => Promise<{ ok: boolean; error?: string }>;
  setAuthFromResponse: (res: AuthResponse) => void;
  claimAdminCodeUser: (admin_code: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const LS_TOKEN = "auth_token";

function parseRole(roleRaw: string): Role {
  const r = roleRaw.toLowerCase();
  if (r === "super_admin") return "super_admin";
  if (r === "admin") return "admin";
  return "student";
}

function sessionFromUser(user: AuthUser): AuthSession {
  return {
    username: user.username,
    role: user.role,
    needsAdminCode: Boolean(user.needs_admin_code),
    assignedAdminCode: user.assigned_admin_code,
    adminCode: user.admin_code,
  };
}

function decodeToken(token: string): AuthSession | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + (4 - (payload.length % 4)) % 4, "=");
    const json = atob(padded);
    const parsed = JSON.parse(json);
    const role = parseRole(String(parsed?.role || "student"));
    const username = String(parsed?.sub || "");
    if (!username) return null;
    return { username, role, needsAdminCode: false };
  } catch {
    return null;
  }
}

function applyAuth(set: (partial: Partial<AuthState>) => void, token: string, user: AuthUser) {
  const session = sessionFromUser(user);
  set({
    token,
    session,
    role: session.role,
    needsAdminCode: session.needsAdminCode,
    isHydrated: true,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isHydrated: false,
  token: null,
  session: null,
  role: null,
  needsAdminCode: false,

  hydrate: () => {
    const token = localStorage.getItem(LS_TOKEN);
    if (!token) {
      set({ token: null, session: null, role: null, needsAdminCode: false, isHydrated: true });
      return;
    }
    clearGuestSession();
    const decoded = decodeToken(token);
    if (!decoded) {
      localStorage.removeItem(LS_TOKEN);
      set({ token: null, session: null, role: null, needsAdminCode: false, isHydrated: true });
      return;
    }
    set({ token, session: decoded, role: decoded.role, needsAdminCode: false, isHydrated: true });
    // Do not log out if /auth/me fails (expired network, 401, etc.) — keep the local session
    // so an in-progress test is not dumped to the login screen.
    getAuthMe()
      .then((user) => {
        if (localStorage.getItem(LS_TOKEN) !== token) return;
        const session = sessionFromUser(user);
        set({ session, role: session.role, needsAdminCode: session.needsAdminCode });
      })
      .catch(() => {});
  },

  refreshMe: async () => {
    const token = get().token;
    if (!token) return;
    const user = await getAuthMe();
    const session = sessionFromUser(user);
    set({ session, role: session.role, needsAdminCode: session.needsAdminCode });
  },

  loginUser: async ({ username, password }) => {
    try {
      const res: AuthResponse = await login({ username, password });
      clearGuestSession();
      localStorage.setItem(LS_TOKEN, res.token);
      applyAuth(set, res.token, res.user);
      return { ok: true };
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      return { ok: false, error: typeof msg === "string" ? msg : "Login failed" };
    }
  },

  signupUser: async ({ username, password, mobile }) => {
    try {
      const digits = mobile.replace(/\D/g, "");
      const res: AuthResponse = await signup({ username, password, mobile: digits || undefined });
      get().setAuthFromResponse(res);
      return { ok: true };
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      return { ok: false, error: typeof msg === "string" ? msg : "Signup failed" };
    }
  },

  setAuthFromResponse: (res: AuthResponse) => {
    clearGuestSession();
    localStorage.setItem(LS_TOKEN, res.token);
    applyAuth(set, res.token, res.user);
  },

  claimAdminCodeUser: async (admin_code) => {
    try {
      const user = await claimAdminCode(admin_code);
      const session = sessionFromUser(user);
      set({ session, role: session.role, needsAdminCode: session.needsAdminCode });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      return { ok: false, error: typeof msg === "string" ? msg : "Could not verify admin code" };
    }
  },

  logout: () => {
    clearGuestSession();
    localStorage.removeItem(LS_TOKEN);
    set({ token: null, session: null, role: null, needsAdminCode: false, isHydrated: true });
  },
}));
