import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as api from "./api";
import { authInputCls, useAuth } from "./auth";
import { formatDateTime } from "./VersionBadge";

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

function Notice({ type, children }: { type: "success" | "error"; children: ReactNode }) {
  return (
    <p
      className={`rounded-xl border p-3 text-sm ${
        type === "success"
          ? "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"
          : "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
      }`}
    >
      {children}
    </p>
  );
}

/** Bouton du header : « Connexion » pour un visiteur, nom du compte pour un utilisateur identifié. */
export default function UserMenu() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs border border-[var(--border)] text-[var(--muted-foreground)] px-3 py-1.5 rounded-lg hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors max-w-[10rem] truncate"
        title={user ? "Mon compte" : "Se connecter pour modifier les recettes"}
      >
        {user ? (
          <>
            <span aria-hidden>👤</span>
            <span className="hidden sm:inline"> {user.username}</span>
            <span className="sr-only sm:hidden">{user.username}</span>
          </>
        ) : (
          "Connexion"
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border)]">
              <h2 className="font-display text-xl">{user ? "Mon compte" : "Connexion"}</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                Fermer
              </button>
            </div>
            <div className="p-5 space-y-6">
              {user ? <Account onLoggedOut={() => setIsOpen(false)} /> : <LoginForm onDone={() => setIsOpen(false)} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username.trim(), password);
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Connexion impossible."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
        Sans compte, les recettes sont en lecture seule. Connectez-vous pour en ajouter, les modifier ou les supprimer.
      </p>
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
        placeholder="Mot de passe"
        autoComplete="current-password"
        className={authInputCls}
      />
      {error && <Notice type="error">{error}</Notice>}
      <button
        type="submit"
        disabled={busy || !username.trim() || !password}
        className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {busy ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

function Account({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { user, isAdmin, logout } = useAuth();
  if (!user) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.username}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{isAdmin ? "Administrateur" : "Utilisateur"}</p>
        </div>
        <button
          type="button"
          onClick={() => logout().then(onLoggedOut)}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        >
          Se déconnecter
        </button>
      </div>

      <PasswordForm />
      <SessionsPanel />
      {isAdmin && <UsersAdmin currentUserId={user.id} />}
      {isAdmin && <AuditLog />}
    </>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setMessage({ type: "error", text: "Les deux nouveaux mots de passe sont différents." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ type: "success", text: "Mot de passe modifié. Vos autres appareils devront se reconnecter." });
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err, "Modification impossible.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-[var(--border)] pt-5">
      <h3 className="font-display text-base">Changer mon mot de passe</h3>
      <input
        type="password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        placeholder="Mot de passe actuel"
        autoComplete="current-password"
        className={authInputCls}
      />
      <input
        type="password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
        placeholder="Nouveau mot de passe (12 caractères minimum)"
        autoComplete="new-password"
        className={authInputCls}
      />
      <input
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        placeholder="Confirmez le nouveau mot de passe"
        autoComplete="new-password"
        className={authInputCls}
      />
      <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
        12 caractères minimum, sans mot de passe courant ni nom d'utilisateur. Une phrase de plusieurs mots est plus sûre et plus facile à retenir.
      </p>
      {message && <Notice type={message.type}>{message.text}</Notice>}
      <button
        type="submit"
        disabled={busy || !current || !next}
        className="w-full rounded-xl border border-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/5 disabled:opacity-40 transition-colors"
      >
        Modifier le mot de passe
      </button>
    </form>
  );
}

function UsersAdmin({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<api.ManagedUser[] | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<api.AuthUser["role"]>("user");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err, "Impossible de charger les utilisateurs.") });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ type: "success", text: success });
      await refresh();
      return true;
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err, "Action impossible.") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    const created = await run(() => api.createUser(username.trim(), password, role), `Compte « ${username.trim()} » créé.`);
    if (created) {
      setUsername("");
      setPassword("");
      setRole("user");
    }
  }

  function resetPassword(user: api.ManagedUser) {
    const value = window.prompt(`Nouveau mot de passe pour « ${user.username} » (12 caractères minimum) :`);
    if (value) void run(() => api.resetUserPassword(user.id, value), `Mot de passe de « ${user.username} » modifié.`);
  }

  function unlock(user: api.ManagedUser) {
    void run(() => api.unlockUser(user.id), `Compte « ${user.username} » déverrouillé.`);
  }

  function changeRole(user: api.ManagedUser) {
    const next = user.role === "admin" ? "user" : "admin";
    const label = next === "admin" ? "administrateur" : "utilisateur simple";
    if (window.confirm(`Passer « ${user.username} » en ${label} ?`)) {
      void run(() => api.setUserRole(user.id, next), `« ${user.username} » est maintenant ${label}.`);
    }
  }

  function disconnect(user: api.ManagedUser) {
    if (window.confirm(`Déconnecter tous les appareils de « ${user.username} » ?`)) {
      void run(() => api.revokeUserSessions(user.id), `Appareils de « ${user.username} » déconnectés.`);
    }
  }

  function removeUser(user: api.ManagedUser) {
    if (window.confirm(`Supprimer le compte « ${user.username} » ?`)) {
      void run(() => api.deleteUser(user.id), `Compte « ${user.username} » supprimé.`);
    }
  }

  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-5">
      <h3 className="font-display text-base">Utilisateurs</h3>
      {message && <Notice type={message.type}>{message.text}</Notice>}

      {users && (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {user.username}
                  {user.id === currentUserId && <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">(vous)</span>}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {user.role === "admin" ? "Administrateur" : "Utilisateur"} ·{" "}
                  {user.lastLoginAt ? `connecté le ${formatDateTime(user.lastLoginAt)}` : "jamais connecté"}
                </p>
                {user.lockedUntil && (
                  <p className="text-xs font-medium text-[var(--accent)]">
                    🔒 Verrouillé après trop d'échecs, jusqu'à {formatDateTime(user.lockedUntil)}
                  </p>
                )}
              </div>
              {user.lockedUntil && (
                <button
                  type="button"
                  onClick={() => unlock(user)}
                  disabled={busy}
                  className="text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-40"
                >
                  Déverrouiller
                </button>
              )}
              <button
                type="button"
                onClick={() => resetPassword(user)}
                disabled={busy}
                className="text-xs text-[var(--primary)] hover:underline disabled:opacity-40"
              >
                Mot de passe
              </button>
              {user.id !== currentUserId && (
                <>
                <button
                  type="button"
                  onClick={() => changeRole(user)}
                  disabled={busy}
                  title={user.role === "admin" ? "Retirer les droits d'administrateur" : "Donner les droits d'administrateur"}
                  className="text-xs text-[var(--primary)] hover:underline disabled:opacity-40"
                >
                  {user.role === "admin" ? "Passer utilisateur" : "Passer admin"}
                </button>
                <button
                  type="button"
                  onClick={() => disconnect(user)}
                  disabled={busy}
                  title="Ferme toutes les sessions ouvertes de ce compte"
                  className="text-xs text-[var(--muted-foreground)] hover:underline disabled:opacity-40"
                >
                  Déconnecter
                </button>
                <button
                  type="button"
                  onClick={() => removeUser(user)}
                  disabled={busy}
                  className="text-xs text-[var(--accent)] hover:underline disabled:opacity-40"
                >
                  Supprimer
                </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addUser} className="space-y-3 rounded-xl bg-[var(--muted)] p-4">
        <p className="text-sm font-medium">Ajouter un compte</p>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Nom d'utilisateur"
          autoComplete="off"
          className={authInputCls}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mot de passe (12 caractères minimum)"
          autoComplete="new-password"
          className={authInputCls}
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as api.AuthUser["role"])}
          className={authInputCls}
        >
          <option value="user">Utilisateur : gère les recettes</option>
          <option value="admin">Administrateur : gère aussi les comptes et la mise à jour</option>
        </select>
        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Créer le compte
        </button>
      </form>
    </section>
  );
}

// ── Appareils connectés ──
function SessionsPanel() {
  const [sessions, setSessions] = useState<api.SessionInfo[] | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setSessions(await api.listSessions());
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err, "Impossible de charger les appareils.") });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ type: "success", text: success });
      await refresh();
    } catch (err) {
      setMessage({ type: "error", text: errorMessage(err, "Action impossible.") });
    } finally {
      setBusy(false);
    }
  }

  const others = sessions?.filter((session) => !session.current).length ?? 0;

  return (
    <section className="space-y-3 border-t border-[var(--border)] pt-5">
      <div>
        <h3 className="font-display text-base">Mes appareils connectés</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Une session se ferme toute seule après une longue période sans activité, ou à sa date de fin. Si vous ne reconnaissez pas un appareil,
          déconnectez-le puis changez votre mot de passe.
        </p>
      </div>

      {message && <Notice type={message.type}>{message.text}</Notice>}

      {sessions && (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {session.device}
                  {session.current && (
                    <span className="ml-2 rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                      Cet appareil
                    </span>
                  )}
                </p>
                <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                  {session.ip} · dernière activité {formatDateTime(session.lastSeenAt)}
                  <br />
                  connecté le {formatDateTime(session.createdAt)} · valide jusqu'au {formatDateTime(session.expiresAt)}
                </p>
              </div>
              {!session.current && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.revokeSession(session.id), `Appareil « ${session.device} » déconnecté.`)}
                  className="shrink-0 text-xs text-[var(--accent)] hover:underline disabled:opacity-40"
                >
                  Déconnecter
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={busy || others === 0}
        onClick={() => {
          if (window.confirm("Déconnecter tous les autres appareils ?")) {
            void run(() => api.revokeOtherSessions(), "Les autres appareils ont été déconnectés.");
          }
        }}
        className="w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 transition-colors"
      >
        Déconnecter tous les autres appareils
      </button>
    </section>
  );
}

// ── Journal des connexions (administrateurs) ──
const EVENT_LABELS: Record<string, string> = {
  login_success: "Connexion",
  login_failed: "Échec de connexion",
  login_blocked: "Connexion bloquée (trop d'essais)",
  logout: "Déconnexion",
  setup: "Création du premier administrateur",
  password_changed: "Mot de passe modifié",
  password_reset: "Mot de passe réinitialisé",
  user_created: "Compte créé",
  user_deleted: "Compte supprimé",
  role_changed: "Type de compte modifié",
  account_unlocked: "Compte déverrouillé",
  session_revoked: "Appareil déconnecté",
  sessions_revoked: "Appareils déconnectés",
  recipes_deleted: "Recettes supprimées",
  update_started: "Mise à jour lancée",
};

const FAILURE_EVENTS = new Set(["login_failed", "login_blocked"]);

function AuditLog() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<api.AuditEntry[] | null>(null);
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setEntries(await api.fetchAuditLog(200));
    } catch (err) {
      setError(errorMessage(err, "Impossible de charger le journal."));
    }
  }

  useEffect(() => {
    if (open && entries === null) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = entries ? (failuresOnly ? entries.filter((entry) => FAILURE_EVENTS.has(entry.event)) : entries) : [];

  return (
    <section className="space-y-3 border-t border-[var(--border)] pt-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="font-display text-base">Journal de connexions</h3>
        <span className={`text-xs text-[var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={failuresOnly}
                onChange={(event) => setFailuresOnly(event.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Échecs seulement
            </label>
            <button type="button" onClick={() => void load()} className="text-xs text-[var(--primary)] hover:underline">
              Actualiser
            </button>
          </div>

          {error && <Notice type="error">{error}</Notice>}
          {entries && shown.length === 0 && !error && (
            <p className="text-xs text-[var(--muted-foreground)]">Aucun événement.</p>
          )}

          <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
            {shown.map((entry, index) => (
              <li key={`${entry.t}-${index}`} className="px-4 py-2">
                <p
                  className={`text-sm font-medium ${
                    FAILURE_EVENTS.has(entry.event) ? "text-[var(--accent)]" : entry.event === "login_success" ? "text-[var(--primary)]" : ""
                  }`}
                >
                  {EVENT_LABELS[entry.event] ?? entry.event}
                  <span className="font-normal text-[var(--foreground)]">
                    {entry.user ? ` · ${entry.user}` : ""}
                    {entry.target ? ` → ${entry.target}` : ""}
                  </span>
                </p>
                <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                  {formatDateTime(entry.t)} · {entry.ip} · {entry.device}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            Pour un échec de connexion, le nom affiché est celui qui a été saisi (il peut ne pas exister).
          </p>
        </>
      )}
    </section>
  );
}
