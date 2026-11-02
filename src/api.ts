import type { PreferenceList, Recipe } from "./App";

const API_BASE = `${import.meta.env.BASE_URL}api`;

export interface ServerData {
  /** false tant que le serveur n'a jamais rien enregistré (premier démarrage). */
  initialized: boolean;
  recipes: Recipe[];
  preferenceLists: PreferenceList[];
}

// ── État de synchronisation (affiché par <SyncStatus />) ───────────────────
interface SyncState {
  pending: number;
  error: string | null;
}

let state: SyncState = { pending: 0, error: null };
const listeners = new Set<() => void>();
const retryListeners = new Set<() => void>();
const unauthorizedListeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const syncStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
};

/** Appelé par l'App pour être prévenue quand l'utilisateur clique sur « Réessayer ». */
export function onRetry(callback: () => void) {
  retryListeners.add(callback);
  return () => {
    retryListeners.delete(callback);
  };
}

/** Appelé quand le serveur refuse une sauvegarde faute de session valide (session expirée…). */
export function onUnauthorized(callback: () => void) {
  unauthorizedListeners.add(callback);
  return () => {
    unauthorizedListeners.delete(callback);
  };
}

export function requestRetry() {
  setState({ error: null });
  retryListeners.forEach((callback) => callback());
}

export function dismissError() {
  setState({ error: null });
}

// ── Requêtes ───────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, tracked = true): Promise<T> {
  if (tracked) setState({ pending: state.pending + 1 });
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.json()).error ?? "";
      } catch {
        /* réponse non JSON */
      }
      throw new ApiError(detail || `HTTP ${response.status}`, response.status);
    }
    const result = (await response.json()) as T;
    if (tracked && state.error) setState({ error: null });
    return result;
  } catch (error) {
    if (tracked) {
      if (error instanceof ApiError && error.status === 401) {
        unauthorizedListeners.forEach((listener) => listener());
        setState({ error: "Session expirée : reconnectez-vous, vos modifications seront alors enregistrées." });
      } else {
        const message = error instanceof Error ? error.message : "erreur réseau";
        setState({ error: `Enregistrement impossible : ${message}` });
      }
    }
    throw error;
  } finally {
    if (tracked) setState({ pending: state.pending - 1 });
  }
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ── Recettes et listes (écriture réservée aux utilisateurs connectés) ─────
export const loadData = () => request<ServerData>("/data", { cache: "no-store" }, false);

export const saveRecipe = (recipe: Recipe) =>
  request<Recipe>(`/recipes/${recipe.id}`, { method: "PUT", body: JSON.stringify(recipe) });

export const deleteRecipes = (ids: number[]) => request<{ deleted: number }>("/recipes/delete", post({ ids }));

export const saveLists = (lists: PreferenceList[]) =>
  request<{ ok: true }>("/lists", { method: "PUT", body: JSON.stringify(lists) });

// ── Comptes ────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
}

export interface AuthState {
  user: AuthUser | null;
  /** true tant qu'aucun compte n'existe : il faut créer le premier administrateur. */
  setupRequired: boolean;
}

export interface ManagedUser extends AuthUser {
  createdAt: string;
}

export const fetchMe = () => request<AuthState>("/auth/me", { cache: "no-store" }, false);

export const setupFirstAdmin = (username: string, password: string) =>
  request<AuthState>("/auth/setup", post({ username, password }), false);

export const login = (username: string, password: string) =>
  request<AuthState>("/auth/login", post({ username, password }), false);

export const logout = () => request<AuthState>("/auth/logout", post(), false);

export const changePassword = (current: string, next: string) =>
  request<{ ok: true }>("/auth/password", post({ current, next }), false);

export const listUsers = () => request<ManagedUser[]>("/users", { cache: "no-store" }, false);

export const createUser = (username: string, password: string, role: AuthUser["role"]) =>
  request<ManagedUser>("/users", post({ username, password, role }), false);

export const deleteUser = (id: number) => request<{ ok: true }>(`/users/${id}`, { method: "DELETE" }, false);

export const resetUserPassword = (id: number, password: string) =>
  request<{ ok: true }>(`/users/${id}/password`, post({ password }), false);

// ── Informations serveur & mise à jour (administrateurs) ──────────────────
export interface ServerInfo {
  version: string;
  /** Commit git du code en cours d'exécution (null si git est indisponible). */
  commit: string | null;
  /** Heure de démarrage du serveur (ISO 8601). */
  startedAt: string;
  updateEnabled: boolean;
  supervised: boolean;
}

export interface UpdateStatus {
  state: "idle" | "running" | "success" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  steps: { id: string; label: string; state: "pending" | "running" | "done" | "skipped" | "error" }[];
  log: string[];
  restarting: boolean;
  changed: boolean;
  message: string;
}

export const loadInfo = () => request<ServerInfo>("/info", { cache: "no-store" }, false);

export const fetchUpdateStatus = () => request<UpdateStatus>("/update", { cache: "no-store" }, false);

export const startUpdate = () => request<UpdateStatus>("/update", post(), false);
