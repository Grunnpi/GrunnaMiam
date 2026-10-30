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

export function requestRetry() {
  setState({ error: null });
  retryListeners.forEach((callback) => callback());
}

export function dismissError() {
  setState({ error: null });
}

// ── Requêtes ───────────────────────────────────────────────────────────────
async function request<T>(path: string, init: RequestInit = {}, tracked = true): Promise<T> {
  if (tracked) setState({ pending: state.pending + 1 });
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.json()).error ?? "";
      } catch {
        /* réponse non JSON */
      }
      throw new Error(detail || `HTTP ${response.status}`);
    }
    const result = (await response.json()) as T;
    if (tracked && state.error) setState({ error: null });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur réseau";
    if (tracked) setState({ error: `Enregistrement impossible : ${message}` });
    throw error;
  } finally {
    if (tracked) setState({ pending: state.pending - 1 });
  }
}

export const loadData = () => request<ServerData>("/data", { cache: "no-store" }, false);

export const saveRecipe = (recipe: Recipe) =>
  request<Recipe>(`/recipes/${recipe.id}`, { method: "PUT", body: JSON.stringify(recipe) });

export const deleteRecipes = (ids: number[]) =>
  request<{ deleted: number }>("/recipes/delete", { method: "POST", body: JSON.stringify({ ids }) });

export const saveLists = (lists: PreferenceList[]) =>
  request<{ ok: true }>("/lists", { method: "PUT", body: JSON.stringify(lists) });
