import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import * as api from "./api";
import type { AuthUser } from "./api";

export const authInputCls =
  "w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition";

interface AuthContextValue {
  status: "loading" | "ready";
  user: AuthUser | null;
  /** Seules les personnes identifiées peuvent ajouter, modifier et supprimer des recettes. */
  canEdit: boolean;
  isAdmin: boolean;
  setupRequired: boolean;
  login(username: string, password: string): Promise<void>;
  setup(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans <AuthProvider>.");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: "loading" | "ready"; user: AuthUser | null; setupRequired: boolean }>({
    status: "loading",
    user: null,
    setupRequired: false,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .fetchMe()
      .then((result) => {
        if (!cancelled) setState({ status: "ready", ...result });
      })
      .catch(() => {
        // Serveur injoignable : l'application affichera elle-même son message d'erreur.
        if (!cancelled) setState({ status: "ready", user: null, setupRequired: false });
      });
    // Une sauvegarde refusée (session expirée) repasse l'interface en lecture seule.
    const stopListening = api.onUnauthorized(() => setState((current) => ({ ...current, user: null })));
    return () => {
      cancelled = true;
      stopListening();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const apply = (result: api.AuthState) => setState({ status: "ready", ...result });
    return {
      status: state.status,
      user: state.user,
      canEdit: state.user !== null,
      isAdmin: state.user?.role === "admin",
      setupRequired: state.setupRequired,
      login: async (username, password) => apply(await api.login(username, password)),
      setup: async (username, password) => apply(await api.setupFirstAdmin(username, password)),
      logout: async () => {
        try {
          await api.logout();
        } finally {
          setState((current) => ({ ...current, user: null }));
        }
      },
    };
  }, [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Affiche l'écran de création du premier administrateur tant qu'aucun compte n'existe. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, setupRequired } = useAuth();
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
        <p className="text-sm text-[var(--muted-foreground)]">Chargement…</p>
      </div>
    );
  }
  if (setupRequired) return <SetupScreen />;
  return <>{children}</>;
}

function SetupScreen() {
  const { setup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Les deux mots de passe sont différents.");
      return;
    }
    setBusy(true);
    try {
      await setup(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"
      >
        <div>
          <h1 className="font-display text-2xl">Bienvenue</h1>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Aucun compte n'existe encore. Créez le compte administrateur : lui seul pourra ensuite créer
            d'autres comptes. Les visiteurs sans compte pourront consulter les recettes, sans les modifier.
          </p>
        </div>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Nom d'utilisateur"
          autoComplete="username"
          autoFocus
          className={authInputCls}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mot de passe (8 caractères minimum)"
          autoComplete="new-password"
          className={authInputCls}
        />
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Confirmez le mot de passe"
          autoComplete="new-password"
          className={authInputCls}
        />
        {error && (
          <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-sm text-[var(--accent)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {busy ? "Création…" : "Créer le compte administrateur"}
        </button>
      </form>
    </div>
  );
}
