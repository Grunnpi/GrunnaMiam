import { useEffect, useRef, useState } from "react";
import { ApiError, fetchUpdateStatus, loadInfo, startUpdate, type UpdateStatus } from "./api";
import { useAuth } from "./auth";
import { formatDateTime, useServerInfo } from "./VersionBadge";

type Phase = "idle" | "running" | "restarting" | "done" | "error";

const STEP_ICONS: Record<UpdateStatus["steps"][number]["state"], string> = {
  pending: "○",
  running: "…",
  done: "✓",
  skipped: "–",
  error: "✕",
};

/** Section « Mise à jour » de la fenêtre « Gérer » (administrateurs) : git pull, build et redémarrage du serveur. */
export default function UpdatePanel() {
  const { isAdmin } = useAuth();
  const info = useServerInfo();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const initialStart = useRef<string | null>(null);

  function fail(err: unknown) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      setError("Session expirée ou droits insuffisants : reconnectez-vous en administrateur.");
    } else {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
    setPhase("error");
  }

  async function begin() {
    setError("");
    try {
      initialStart.current = info?.startedAt ?? (await loadInfo()).startedAt;
      setStatus(await startUpdate());
      setPhase("running");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setPhase("running"); // une mise à jour tourne déjà : on la suit
        return;
      }
      fail(err);
    }
  }

  // Suivi : on interroge l'état de la mise à jour, puis (pendant le redémarrage)
  // le serveur lui-même, jusqu'à ce que son heure de démarrage change.
  useEffect(() => {
    if (phase !== "running" && phase !== "restarting") return;
    let stopped = false;

    const tick = async () => {
      try {
        if (phase === "running") {
          const next = await fetchUpdateStatus();
          if (stopped) return;
          setStatus(next);
          if (next.restarting) setPhase("restarting");
          else if (next.state === "success") setPhase("done");
          else if (next.state === "error") setPhase("error");
        } else {
          const current = await loadInfo();
          if (!stopped && current.startedAt !== initialStart.current) window.location.reload();
        }
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) fail(err);
        // Serveur injoignable pendant la mise à jour : il est probablement en train de redémarrer.
        else if (phase === "running") setPhase("restarting");
      }
    };

    const timer = window.setInterval(tick, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [phase]);

  if (!isAdmin) return null;

  const busy = phase === "running" || phase === "restarting";

  return (
    <section className="space-y-3 border-t border-[var(--border)] pt-5">
      <div>
        <h3 className="font-display text-base">Mise à jour de l'application</h3>
        {info && (
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Version v{info.version}
            {info.commit ? ` (${info.commit})` : ""} · serveur démarré le {formatDateTime(info.startedAt)}
          </p>
        )}
      </div>

      {info && !info.updateEnabled ? (
        <p className="rounded-xl bg-[var(--muted)] p-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          La mise à jour depuis l'application n'est pas disponible sur ce serveur.
        </p>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            Lance <code>git pull</code>, recompile le site puis redémarre le serveur. Les recettes ne sont pas touchées.
          </p>
          <button
            type="button"
            onClick={begin}
            disabled={!info || busy}
            className="w-full rounded-xl border border-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/5 disabled:opacity-40 transition-colors"
          >
            {phase === "running"
              ? "Mise à jour en cours…"
              : phase === "restarting"
                ? "Redémarrage du serveur…"
                : "Mettre à jour maintenant"}
          </button>
        </>
      )}

      {error && (
        <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-sm text-[var(--accent)]">
          {error}
        </p>
      )}

      {status && phase !== "idle" && (
        <div className="space-y-2">
          <ul className="space-y-1 text-xs">
            {status.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2">
                <span
                  className={`w-4 text-center ${
                    step.state === "error"
                      ? "text-[var(--accent)]"
                      : step.state === "done"
                        ? "text-[var(--primary)]"
                        : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {STEP_ICONS[step.state]}
                </span>
                <span className={step.state === "pending" ? "text-[var(--muted-foreground)]" : ""}>{step.label}</span>
              </li>
            ))}
          </ul>

          {status.message && (
            <p
              className={`text-sm ${status.state === "error" ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}
            >
              {status.message}
            </p>
          )}
          {phase === "restarting" && (
            <p className="text-xs text-[var(--muted-foreground)]">
              La page se rechargera toute seule dès que le serveur sera revenu.
            </p>
          )}

          {status.log.length > 0 && (
            <pre className="max-h-40 overflow-auto rounded-xl bg-[var(--muted)] p-3 text-[10px] leading-snug whitespace-pre-wrap break-all">
              {status.log.slice(-60).join("\n")}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
