import { create } from "zustand";
import type { AuthResponse, Role } from "../api/types";
import { login, signup } from "../api/client";

export interface AuthSession {
  username: string;
  role: Role;
}

interface AuthState {
  isHydrated: boolean;
  token: string | null;
  session: AuthSession | null;
  role: Role | null;

  hydrate: () => void;
  loginUser: (args: { username: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  signupUser: (args: { username: string; password: string; role_key?: string }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const LS_TOKEN = "auth_token";

function decodeToken(token: string): { username: string; role: Role } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + (4 - (payload.length % 4)) % 4, "=");
    const json = atob(padded);
    const parsed = JSON.parse(json);
    const roleRaw = String(parsed?.role || "").toLowerCase();
    const role: Role = roleRaw === "admin" ? "admin" : "student";
    const username = String(parsed?.sub || "");
    if (!username) return null;
    return { username, role };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  isHydrated: false,
  token: null,
  session: null,
  role: null,

  hydrate: () => {
    const token = localStorage.getItem(LS_TOKEN);
    if (!token) {
      set({ token: null, session: null, role: null, isHydrated: true });
      return;
    }
    const decoded = decodeToken(token);
    if (!decoded) {
      localStorage.removeItem(LS_TOKEN);
      set({ token: null, session: null, role: null, isHydrated: true });
      return;
    }
    set({ token, session: decoded, role: decoded.role, isHydrated: true });
  },

  loginUser: async ({ username, password }) => {
    try {
      const res: AuthResponse = await login({ username, password });
      localStorage.setItem(LS_TOKEN, res.token);
      set({ token: res.token, session: res.user, role: res.user.role, isHydrated: true });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      return { ok: false, error: typeof msg === "string" ? msg : "Login failed" };
    }
  },

  signupUser: async ({ username, password, role_key }) => {
    try {
      const res: AuthResponse = await signup({ username, password, role_key });
      localStorage.setItem(LS_TOKEN, res.token);
      set({ token: res.token, session: res.user, role: res.user.role, isHydrated: true });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      return { ok: false, error: typeof msg === "string" ? msg : "Signup failed" };
    }
  },

  logout: () => {
    localStorage.removeItem(LS_TOKEN);
    set({ token: null, session: null, role: null, isHydrated: true });
  },
}));

